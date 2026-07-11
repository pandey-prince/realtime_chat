import { prisma } from "@/lib/prisma";
import {
  normalizeRoomCode,
  persistentAuthCookieName,
  persistentRealtimeChannel,
} from "@/lib/persistent-room";
import { isRoomMember, roomAuthCookieName } from "@/lib/room-members";

const PERSIST_PREFIX = "persist:";

export async function authorizeRealtimeChannels(
  request: Request,
  channels: string[],
): Promise<Response | void> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  for (const channel of channels) {
    if (channel.startsWith(PERSIST_PREFIX)) {
      const rawCode = channel.slice(PERSIST_PREFIX.length);
      const code = normalizeRoomCode(rawCode);
      if (!code) {
        return new Response("Invalid channel", { status: 403 });
      }

      const token = cookies[persistentAuthCookieName(code)];
      if (!token) {
        return new Response("Unauthorized channel", { status: 403 });
      }

      const room = await prisma.persistentRoom.findFirst({
        where: { code, deletedAt: null },
        select: { id: true },
      });

      if (!room) {
        return new Response("Room not found", { status: 403 });
      }

      const member = await prisma.persistentMember.findFirst({
        where: { roomId: room.id, token },
        select: { id: true },
      });

      if (!member) {
        return new Response("Unauthorized channel", { status: 403 });
      }

      continue;
    }

    const roomId = channel;
    const token = cookies[roomAuthCookieName(roomId)];
    if (!token || !(await isRoomMember(roomId, token))) {
      return new Response("Unauthorized channel", { status: 403 });
    }
  }
}

export { persistentRealtimeChannel };
