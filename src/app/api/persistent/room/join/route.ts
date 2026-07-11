import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  normalizeRoomCode,
  PERSISTENT_MEMBER_LIMIT,
  persistentAuthCookieName,
} from "@/lib/persistent-room";
import { checkJoinRateLimit } from "@/lib/rate-limit";
import { sanitizeUsername } from "@/lib/username";
import {
  createSystemMessage,
  emitMemberJoined,
} from "@/app/api/[[...slugs]]/persistent";

export async function POST(req: NextRequest) {
  const rawCode = req.nextUrl.searchParams.get("code");

  if (!rawCode) {
    return NextResponse.json({ error: "missing-code" }, { status: 400 });
  }

  const code = normalizeRoomCode(rawCode);
  if (!code) {
    return NextResponse.json({ error: "invalid-code" }, { status: 400 });
  }

  const joinRate = await checkJoinRateLimit(`persist-join:${code}`);
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

  const room = await prisma.persistentRoom.findFirst({
    where: { code },
    select: { id: true, code: true, deletedAt: true },
  });

  if (!room || room.deletedAt) {
    return NextResponse.json(
      { error: room?.deletedAt ? "room-deleted" : "room-not-found" },
      { status: 404 },
    );
  }

  const cookieName = persistentAuthCookieName(code);
  const existing = req.cookies.get(cookieName)?.value;

  if (existing) {
    const member = await prisma.persistentMember.findFirst({
      where: { roomId: room.id, token: existing },
    });

    if (member) {
      if (member.sender !== username) {
        await prisma.persistentMember.update({
          where: { id: member.id },
          data: { sender: username },
        });
      }

      const memberCount = await prisma.persistentMember.count({
        where: { roomId: room.id },
      });
      return NextResponse.json({ ok: true, memberCount });
    }
  }

  const token = nanoid();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const memberCount = await tx.persistentMember.count({
        where: { roomId: room.id },
      });

      if (memberCount >= PERSISTENT_MEMBER_LIMIT) {
        return { status: "full" as const };
      }

      await tx.persistentMember.create({
        data: { roomId: room.id, token, sender: username },
      });

      return { status: "joined" as const, memberCount: memberCount + 1 };
    });

    if (result.status === "full") {
      return NextResponse.json({ error: "room-full" }, { status: 403 });
    }

    await createSystemMessage(room.id, code, "A user joined the room.");
    await emitMemberJoined(code, result.memberCount);

    const response = NextResponse.json({
      ok: true,
      memberCount: result.memberCount,
    });

    response.cookies.set(cookieName, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Persistent join failed:", error);
    return NextResponse.json({ error: "join-failed" }, { status: 500 });
  }
}
