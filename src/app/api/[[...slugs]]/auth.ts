import {
  getMemberSender,
  isRoomMember,
  roomAuthCookieName,
} from "@/lib/room-members";
import { Elysia } from "elysia";

class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export const authMiddleware = new Elysia({ name: "auth" })
  .error({ AuthError })
  .onError(({ code, set }) => {
    if (code === "AuthError") {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })
  .derive({ as: "scoped" }, async ({ query, cookie }) => {
    const roomId = query.roomId;
    const token = cookie[roomAuthCookieName(roomId)]?.value as
      | string
      | undefined;

    if (!roomId || !token) {
      throw new AuthError("Missing roomId or token.");
    }

    if (!(await isRoomMember(roomId, token))) {
      throw new AuthError("Invalid token");
    }

    const sender = await getMemberSender(roomId, token);
    if (!sender) {
      throw new AuthError("Sender not registered");
    }

    return { auth: { roomId, token, sender } };
  });
