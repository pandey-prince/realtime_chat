import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  isRoomMember,
  roomAuthCookieName,
  syncRoomTokensExpiry,
  tryJoinRoom,
} from "@/lib/room-members";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");

  if (!roomId) {
    return NextResponse.json({ error: "missing-room-id" }, { status: 400 });
  }

  const roomExists = await redis.exists(`meta:${roomId}`);
  if (!roomExists) {
    return NextResponse.json({ error: "room-not-found" }, { status: 404 });
  }

  const cookieName = roomAuthCookieName(roomId);
  const existing = req.cookies.get(cookieName)?.value;

  if (existing && (await isRoomMember(roomId, existing))) {
    return NextResponse.json({ ok: true });
  }

  const token = nanoid();
  const joinResult = await tryJoinRoom(roomId, token);

  if (joinResult === "full") {
    return NextResponse.json({ error: "room-full" }, { status: 403 });
  }

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
