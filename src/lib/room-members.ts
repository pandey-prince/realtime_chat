import { redis } from "./redis";

export const roomTokensKey = (roomId: string) => `tokens:${roomId}`;

type JoinResult = "joined" | "already" | "full";

export async function tryJoinRoom(
  roomId: string,
  token: string,
): Promise<JoinResult> {
  const result = await redis.eval<number>(
    `
    if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
      return 2
    end
    if redis.call('SCARD', KEYS[1]) >= 2 then
      return 0
    end
    redis.call('SADD', KEYS[1], ARGV[1])
    return 1
    `,
    [roomTokensKey(roomId)],
    [token],
  );

  if (result === 2) return "already";
  if (result === 0) return "full";
  return "joined";
}

export async function isRoomMember(
  roomId: string,
  token: string,
): Promise<boolean> {
  const inSet = (await redis.sismember(roomTokensKey(roomId), token)) === 1;
  if (inSet) return true;

  const legacy = await redis.hget<string[]>(`meta:${roomId}`, "connected");
  return Array.isArray(legacy) && legacy.includes(token);
}

export async function syncRoomTokensExpiry(roomId: string) {
  const ttl = await redis.ttl(`meta:${roomId}`);
  if (ttl > 0) {
    await redis.expire(roomTokensKey(roomId), ttl);
  }
}
