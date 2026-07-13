import { prisma } from "@/lib/prisma";
import {
  checkCreateRateLimit,
  checkMessageRateLimit,
} from "@/lib/rate-limit";
import {
  generateRoomCode,
  normalizeRoomCode,
  PERSISTENT_MEMBER_LIMIT,
  PERSISTENT_MESSAGES_PAGE_SIZE,
  persistentRealtimeChannel,
} from "@/lib/persistent-room";
import { Message, realtime } from "@/lib/realtime";
import { Elysia } from "elysia";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { persistentAuthMiddleware } from "./persistent-auth";

const MESSAGE_CIPHERTEXT_MAX = 8192;
const E2E_SALT_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const E2E_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function toClientMessage(
  msg: {
    id: string;
    sender: string;
    text: string;
    createdAt: Date;
  },
  code: string,
  token?: string,
  isSystem?: boolean,
): Message {
  return {
    id: msg.id,
    sender: msg.sender,
    text: msg.text,
    timestamp: msg.createdAt.getTime(),
    roomId: code,
    token,
    isSystem,
  };
}

function isValidE2eMaterial(salt: string, verifier: string) {
  return E2E_SALT_PATTERN.test(salt) && E2E_VERIFIER_PATTERN.test(verifier);
}

async function recreatePersistentRoom(
  roomId: string,
  name: string,
  e2eSalt: string,
  e2eVerifier: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.persistentMessage.deleteMany({ where: { roomId } });
    await tx.persistentMember.deleteMany({ where: { roomId } });

    return tx.persistentRoom.update({
      where: { id: roomId },
      data: {
        name,
        deletedAt: null,
        e2eSalt,
        e2eVerifier,
      },
      select: { code: true, name: true },
    });
  });
}

export const persistentRoutes = new Elysia({ prefix: "/persistent" })
  .post(
    "/room/create",
    async ({ body, set, request }) => {
      const clientKey =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        "unknown";
      const createRate = await checkCreateRateLimit(`persist-create:${clientKey}`);
      if (!createRate.allowed) {
        set.status = 429;
        return { error: "rate-limited", retryAfter: createRate.retryAfter };
      }

      const name = body.name.trim();
      if (!name || name.length > 100) {
        set.status = 400;
        return { error: "invalid-name" };
      }

      const e2eSalt = body.e2eSalt.trim();
      const e2eVerifier = body.e2eVerifier.trim();
      if (!isValidE2eMaterial(e2eSalt, e2eVerifier)) {
        set.status = 400;
        return { error: "invalid-e2e-material" };
      }

      const customCode = body.code?.trim();
      let code: string;

      if (customCode) {
        const normalized = normalizeRoomCode(customCode);
        if (!normalized) {
          set.status = 400;
          return { error: "invalid-code" };
        }
        code = normalized;

        const existing = await prisma.persistentRoom.findUnique({
          where: { code },
          select: { id: true, deletedAt: true },
        });

        if (existing) {
          if (!existing.deletedAt) {
            set.status = 409;
            return { error: "code-taken" };
          }

          const room = await recreatePersistentRoom(
            existing.id,
            name,
            e2eSalt,
            e2eVerifier,
          );
          return room;
        }

        try {
          const room = await prisma.persistentRoom.create({
            data: { code, name, e2eSalt, e2eVerifier },
            select: { code: true, name: true },
          });
          return room;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            set.status = 409;
            return { error: "code-taken" };
          }
          throw error;
        }
      }

      for (let attempt = 0; attempt < 3; attempt++) {
        code = generateRoomCode();

        const existing = await prisma.persistentRoom.findUnique({
          where: { code },
          select: { id: true, deletedAt: true },
        });

        if (existing?.deletedAt) {
          const room = await recreatePersistentRoom(
            existing.id,
            name,
            e2eSalt,
            e2eVerifier,
          );
          return room;
        }

        if (existing && !existing.deletedAt) {
          continue;
        }

        try {
          const room = await prisma.persistentRoom.create({
            data: { code, name, e2eSalt, e2eVerifier },
            select: { code: true, name: true },
          });
          return room;
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            continue;
          }
          throw error;
        }
      }

      set.status = 500;
      return { error: "create-failed" };
    },
    {
      body: z.object({
        name: z.string().max(100),
        code: z.string().max(16).optional(),
        e2eSalt: z.string().max(64),
        e2eVerifier: z.string().max(128),
      }),
    },
  )
  .get(
    "/room",
    async ({ query, set }) => {
      const code = normalizeRoomCode(query.code);
      if (!code) {
        set.status = 400;
        return { error: "invalid-code" };
      }

      const room = await prisma.persistentRoom.findFirst({
        where: { code, deletedAt: null },
        select: {
          code: true,
          name: true,
          createdAt: true,
          e2eSalt: true,
          e2eVerifier: true,
          _count: { select: { members: true } },
        },
      });

      if (!room) {
        set.status = 404;
        return { error: "room-not-found" };
      }

      return {
        code: room.code,
        name: room.name,
        createdAt: room.createdAt.getTime(),
        memberCount: room._count.members,
        e2eSalt: room.e2eSalt,
        e2eVerifier: room.e2eVerifier,
      };
    },
    { query: z.object({ code: z.string() }) },
  )
  .use(persistentAuthMiddleware)
  .delete(
    "/room",
    async ({ persistentAuth }) => {
      await createSystemMessage(
        persistentAuth.roomId,
        persistentAuth.code,
        "Room deleted by a member.",
      );

      await prisma.persistentRoom.update({
        where: { id: persistentAuth.roomId },
        data: { deletedAt: new Date() },
      });

      await realtime
        .channel(persistentRealtimeChannel(persistentAuth.code))
        .emit("persistent.destroy", { isDestroyed: true });

      return { ok: true };
    },
    { query: z.object({ code: z.string() }) },
  )
  .get(
    "/messages",
    async ({ query, persistentAuth, set }) => {
      const limit = Math.min(
        query.limit ?? PERSISTENT_MESSAGES_PAGE_SIZE,
        PERSISTENT_MESSAGES_PAGE_SIZE,
      );

      const cursorMsg = query.cursor
        ? await prisma.persistentMessage.findFirst({
            where: {
              id: query.cursor,
              roomId: persistentAuth.roomId,
            },
            select: { createdAt: true },
          })
        : null;

      if (query.cursor && !cursorMsg) {
        set.status = 400;
        return { error: "invalid-cursor" };
      }

      const messages = await prisma.persistentMessage.findMany({
        where: {
          roomId: persistentAuth.roomId,
          ...(cursorMsg ? { createdAt: { lt: cursorMsg.createdAt } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
      });

      const hasMore = messages.length > limit;
      const page = hasMore ? messages.slice(0, limit) : messages;
      const ordered = [...page].reverse();

      return {
        messages: ordered.map((m) =>
          toClientMessage(
            m,
            persistentAuth.code,
            undefined,
            m.sender === "__system__",
          ),
        ),
        nextCursor: hasMore ? page[page.length - 1]?.id : undefined,
        hasMore,
      };
    },
    {
      query: z.object({
        code: z.string(),
        cursor: z.string().optional(),
        limit: z.coerce.number().optional(),
      }),
    },
  )
  .post(
    "/messages",
    async ({ body, persistentAuth, set }) => {
      const rate = await checkMessageRateLimit(
        `persist:${persistentAuth.memberId}`,
      );

      if (!rate.allowed) {
        set.status = 429;
        return { error: "rate-limited", retryAfter: rate.retryAfter };
      }

      if (!body.text || body.text.length > MESSAGE_CIPHERTEXT_MAX) {
        set.status = 400;
        return { error: "invalid-text" };
      }

      const message = await prisma.persistentMessage.create({
        data: {
          roomId: persistentAuth.roomId,
          sender: persistentAuth.sender,
          text: body.text,
        },
      });

      const clientMessage = toClientMessage(
        message,
        persistentAuth.code,
        persistentAuth.token,
      );

      await realtime
        .channel(persistentRealtimeChannel(persistentAuth.code))
        .emit("persistent.message", clientMessage);

      return clientMessage;
    },
    {
      query: z.object({ code: z.string() }),
      body: z.object({
        text: z.string().max(MESSAGE_CIPHERTEXT_MAX),
      }),
    },
  );

export async function createSystemMessage(
  roomId: string,
  code: string,
  text: string,
) {
  const message = await prisma.persistentMessage.create({
    data: {
      roomId,
      sender: "__system__",
      text,
    },
  });

  const clientMessage = toClientMessage(message, code, undefined, true);

  await realtime
    .channel(persistentRealtimeChannel(code))
    .emit("persistent.message", clientMessage);

  return clientMessage;
}

export async function emitMemberJoined(code: string, memberCount: number) {
  await realtime
    .channel(persistentRealtimeChannel(code))
    .emit("persistent.memberJoined", { memberCount });
}
