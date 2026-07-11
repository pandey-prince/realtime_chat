import { NextRequest, NextResponse } from "next/server";
import { redis } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { normalizeRoomCode } from "./lib/persistent-room";

export const proxy = async (req: NextRequest) => {
  const pathname = req.nextUrl.pathname;

  if (pathname === "/persistent") {
    return NextResponse.next();
  }

  const persistentMatch = pathname.match(/^\/persistent\/([^/]+)$/);
  if (persistentMatch) {
    const code = normalizeRoomCode(persistentMatch[1]);
    if (!code) {
      return NextResponse.redirect(
        new URL("/persistent?error=invalid-code", req.url),
      );
    }

    try {
      const room = await prisma.persistentRoom.findFirst({
        where: { code, deletedAt: null },
        select: { id: true },
      });

      if (!room) {
        return NextResponse.redirect(
          new URL("/persistent?error=room-not-found", req.url),
        );
      }
    } catch {
      return NextResponse.redirect(
        new URL("/persistent?error=room-not-found", req.url),
      );
    }

    return NextResponse.next();
  }

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
  if (!roomMatch) return NextResponse.redirect(new URL("/", req.url));

  const roomId = roomMatch[1];

  const meta = await redis.hgetall<{ createdAt: number }>(`meta:${roomId}`);

  if (!meta) {
    return NextResponse.redirect(new URL("/?error=room-not-found", req.url));
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/room/:path*", "/persistent/:path*"],
};
