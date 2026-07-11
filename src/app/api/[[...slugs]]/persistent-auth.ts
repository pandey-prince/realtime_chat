import { prisma } from "@/lib/prisma";
import {
  normalizeRoomCode,
  persistentAuthCookieName,
} from "@/lib/persistent-room";
import { Elysia } from "elysia";

class PersistentAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistentAuthError";
  }
}

export const persistentAuthMiddleware = new Elysia({ name: "persistent-auth" })
  .error({ PersistentAuthError })
  .onError(({ code, set }) => {
    if (code === "PersistentAuthError") {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .derive({ as: "scoped" }, async ({ query, cookie }) => {
    const code = normalizeRoomCode(query.code);
    if (!code) {
      throw new PersistentAuthError("Invalid code.");
    }

    const token = cookie[persistentAuthCookieName(code)]?.value as
      | string
      | undefined;

    if (!token) {
      throw new PersistentAuthError("Missing token.");
    }

    const room = await prisma.persistentRoom.findFirst({
      where: { code, deletedAt: null },
      select: { id: true, code: true },
    });

    if (!room) {
      throw new PersistentAuthError("Room not found.");
    }

    const member = await prisma.persistentMember.findFirst({
      where: { roomId: room.id, token },
      select: { id: true, token: true, sender: true },
    });

    if (!member) {
      throw new PersistentAuthError("Invalid token.");
    }

    return {
      persistentAuth: {
        code: room.code,
        roomId: room.id,
        token: member.token,
        memberId: member.id,
        sender: member.sender,
      },
    };
  });
