import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  isRoomMember,
  roomAuthCookieName,
  setMemberSender,
  syncRoomTokensExpiry,
  tryJoinRoom,
} from "@/lib/room-members";
import { checkJoinRateLimit } from "@/lib/rate-limit";
import { sanitizeUsername } from "@/lib/username";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");

  if (!roomId || roomId.length > 32) {
    return NextResponse.json({ error: "missing-room-id" }, { status: 400 });
  }

  const joinRate = await checkJoinRateLimit(`ephemeral-join:${roomId}`);
  if (!joinRate.allowed) {
    return NextResponse.json(
      { error: "rate-limited", retryAfter: joinRate.retryAfter },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    username?: string;
  } | null;
  const username = sanitizeUsername(body?.username);
  if (!username) {
    return NextResponse.json({ error: "invalid-username" }, { status: 400 });
  }

  const roomExists = await redis.exists(`meta:${roomId}`);
  if (!roomExists) {
    return NextResponse.json({ error: "room-not-found" }, { status: 404 });
  }

  const cookieName = roomAuthCookieName(roomId);
  const existing = req.cookies.get(cookieName)?.value;

  if (existing && (await isRoomMember(roomId, existing))) {
    await setMemberSender(roomId, existing, username);
    return NextResponse.json({ ok: true });
  }

  const token = nanoid();
  const joinResult = await tryJoinRoom(roomId, token);

  if (joinResult === "full") {
    return NextResponse.json({ error: "room-full" }, { status: 403 });
  }

  await setMemberSender(roomId, token, username);
  await syncRoomTokensExpiry(roomId);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
