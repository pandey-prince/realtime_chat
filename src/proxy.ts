import { NextRequest, NextResponse } from "next/server";
import { redis } from "./lib/redis";
import {
  isRoomMember,
  syncRoomTokensExpiry,
  tryJoinRoom,
} from "./lib/room-members";
import { nanoid } from "nanoid";

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url));

  const roomId = roomMatch[1];

  const meta = await redis.hgetall<{ createdAt: number }>(`meta:${roomId}`);

  if (!meta) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url));
  }

  const existingToken = req.cookies.get("x-auth-token")?.value;

  if (existingToken && (await isRoomMember(roomId, existingToken))) {
    return NextResponse.next();
  }

  const token = nanoid();
  const joinResult = await tryJoinRoom(roomId, token);

  if (joinResult === "full") {
    return NextResponse.redirect(new URL("/?error=room-full", req.url));
  }

  await syncRoomTokensExpiry(roomId);

  const response = NextResponse.next();

  response.cookies.set("x-auth-token", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
};

export const config = {
  matcher: "/room/:path*",
};
