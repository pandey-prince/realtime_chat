import { redis } from "@/lib/redis";
import { InferRealtimeEvents, Realtime } from "@upstash/realtime";
import { z } from "zod";

export const messageSchema = z.object({
  id: z.string(),
  sender: z.string(),
  text: z.string().max(8192),
  timestamp: z.number(),
  roomId: z.string(),
  token: z.string().optional(),
  isSystem: z.boolean().optional(),
});

const schema = {
  chat: {
    message: messageSchema,
    destroy: z.object({
      isDestroyed: z.literal(true),
    }),
  },
  persistent: {
    message: messageSchema,
    destroy: z.object({
      isDestroyed: z.literal(true),
    }),
    memberJoined: z.object({
      memberCount: z.number(),
    }),
  },
};

export const realtime = new Realtime({ schema, redis });
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>;
export type Message = z.infer<typeof messageSchema>;
