import { RoomNotFoundError } from "@/lib/errors";
import {
  checkCreateRateLimit,
  checkMessageRateLimit,
} from "@/lib/rate-limit";
import { memberSendersKey, roomTokensKey } from "@/lib/room-members";
import { redis } from "@/lib/redis";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { authMiddleware } from "./auth";
import { persistentRoutes } from "./persistent";
import { z } from "zod";
import { Message, realtime } from "@/lib/realtime";

const ROOM_TTL_SECONDS = 60 * 10;
const MAX_ROOM_ID_LENGTH = 32;

const rooms = new Elysia({ prefix: "/room" })
  .post("/create", async ({ request, set }) => {
    const clientKey =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const createRate = await checkCreateRateLimit(`ephemeral-create:${clientKey}`);
    if (!createRate.allowed) {
      set.status = 429;
      return { error: "rate-limited", retryAfter: createRate.retryAfter };
    }

    const roomId = nanoid();

    await redis.hset(`meta:${roomId}`, {
      createdAt: Date.now(),
    });

    await redis.expire(`meta:${roomId}`, ROOM_TTL_SECONDS);

    return { roomId };
  })
  .use(authMiddleware)
  .get(
    "/ttl",
    async ({ auth }) => {
      const ttl = await redis.ttl(`meta:${auth.roomId}`);
      return { ttl: ttl > 0 ? ttl : 0 };
    },
    { query: z.object({ roomId: z.string().max(MAX_ROOM_ID_LENGTH) }) },
  )
  .delete(
    "/",
    async ({ auth }) => {
      await realtime
        .channel(auth.roomId)
        .emit("chat.destroy", { isDestroyed: true });

      await Promise.all([
        redis.del(`meta:${auth.roomId}`),
        redis.del(`messages:${auth.roomId}`),
        redis.del(roomTokensKey(auth.roomId)),
        redis.del(memberSendersKey(auth.roomId)),
      ]);
    },
    { query: z.object({ roomId: z.string().max(MAX_ROOM_ID_LENGTH) }) },
  );

const messages = new Elysia({ prefix: "/messages" })
  .error({ RoomNotFoundError })
  .onError(({ code, set }) => {
    if (code === "RoomNotFoundError") {
      set.status = 404;
      return { error: "room-not-found" };
    }
  })
  .use(authMiddleware)
  .post(
    "/",
    async ({ body, auth, set }) => {
      const rate = await checkMessageRateLimit(`ephemeral:${auth.token}`);
      if (!rate.allowed) {
        set.status = 429;
        return { error: "rate-limited", retryAfter: rate.retryAfter };
      }

      const { roomId, sender } = auth;

      const roomExists = await redis.exists(`meta:${roomId}`);

      if (!roomExists) {
        throw new RoomNotFoundError();
      }

      const message: Message = {
        id: nanoid(),
        sender,
        text: body.text,
        timestamp: Date.now(),
        roomId,
      };

      await redis.rpush(`messages:${roomId}`, message);
      await realtime.channel(roomId).emit("chat.message", message);

      const remaining = await redis.ttl(`meta:${roomId}`);
      if (remaining > 0) {
        await redis.expire(`messages:${roomId}`, remaining);
      }

      return message;
    },
    {
      query: z.object({ roomId: z.string().max(MAX_ROOM_ID_LENGTH) }),
      body: z.object({
        text: z.string().max(1000),
      }),
    },
  )
  .get(
    "/",
    async ({ auth }) => {
      const messages = await redis.lrange<Message>(
        `messages:${auth.roomId}`,
        0,
        -1,
      );

      return {
        messages: messages.map((m) => ({
          ...m,
          token: undefined,
        })),
      };
    },
    { query: z.object({ roomId: z.string().max(MAX_ROOM_ID_LENGTH) }) },
  );

const app = new Elysia({ prefix: "/api" })
  .use(rooms)
  .use(messages)
  .use(persistentRoutes);

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;

export type App = typeof app;
