import { redis } from "./redis";

export const roomTokensKey = (roomId: string) => `tokens:${roomId}`;
export const memberSendersKey = (roomId: string) => `senders:${roomId}`;

export const roomAuthCookieName = (roomId: string) => `auth_${roomId}`;

type JoinResult = "joined" | "already" | "full";

export async function tryJoinRoom(
  roomId: string,
  token: string,
): Promise<JoinResult> {
  const result = await redis.eval(
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

  const code = Number(result);

  if (code === 2) return "already";
  if (code === 0) return "full";
  return "joined";
}

export async function isRoomMember(
  roomId: string,
  token: string,
): Promise<boolean> {
  return (await redis.sismember(roomTokensKey(roomId), token)) === 1;
}

export async function syncRoomTokensExpiry(roomId: string) {
  const ttl = await redis.ttl(`meta:${roomId}`);
  if (ttl > 0) {
    await redis.expire(roomTokensKey(roomId), ttl);
    await redis.expire(memberSendersKey(roomId), ttl);
  }
}

export async function setMemberSender(
  roomId: string,
  token: string,
  sender: string,
) {
  await redis.hset(memberSendersKey(roomId), { [token]: sender });
  await syncRoomTokensExpiry(roomId);
}

export async function getMemberSender(
  roomId: string,
  token: string,
): Promise<string | null> {
  return redis.hget<string>(memberSendersKey(roomId), token);
}
