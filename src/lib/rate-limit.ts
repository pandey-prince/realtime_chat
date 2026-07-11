import { redis } from "@/lib/redis";

const RATE_LIMIT_WINDOW_SECONDS = 10;
const RATE_LIMIT_MAX_MESSAGES = 10;
const RATE_LIMIT_MAX_JOINS = 20;
const RATE_LIMIT_MAX_CREATES = 10;

const rateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds = RATE_LIMIT_WINDOW_SECONDS,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const redisKey = `rate:${key}`;

  const count = Number(
    await redis.eval(rateLimitScript, [redisKey], [String(windowSeconds)]),
  );

  if (count > max) {
    const ttl = await redis.ttl(redisKey);
    return {
      allowed: false,
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  }

  return { allowed: true };
}

export async function checkMessageRateLimit(key: string) {
  return checkRateLimit(key, RATE_LIMIT_MAX_MESSAGES);
}

export async function checkJoinRateLimit(key: string) {
  return checkRateLimit(key, RATE_LIMIT_MAX_JOINS);
}

export async function checkCreateRateLimit(key: string) {
  return checkRateLimit(key, RATE_LIMIT_MAX_CREATES);
}
