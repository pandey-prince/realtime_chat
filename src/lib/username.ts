const USERNAME_PATTERN = /^anonymous-[a-z]+-[A-Za-z0-9_-]{5}$/;
const MAX_USERNAME_LENGTH = 100;

export function sanitizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_USERNAME_LENGTH) return null;
  if (!USERNAME_PATTERN.test(trimmed)) return null;

  return trimmed;
}
