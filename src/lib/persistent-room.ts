import { customAlphabet } from "nanoid";

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateCode = customAlphabet(CODE_ALPHABET, 8);

const RESERVED_CODES = new Set([
  "CREATE",
  "JOIN",
  "ADMIN",
  "DELETE",
  "ROOM",
  "PERSIST",
  "PERSISTENT",
  "API",
  "NULL",
  "TEST",
]);

export const PERSISTENT_MEMBER_LIMIT = 10;
export const PERSISTENT_MESSAGES_PAGE_SIZE = 50;

export function persistentAuthCookieName(code: string) {
  return `auth_persist_${code}`;
}

export function persistentRealtimeChannel(code: string) {
  return `persist:${code}`;
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (code.length < 4 || code.length > 16) return null;
  if (RESERVED_CODES.has(code)) return null;

  return code;
}

export function generateRoomCode(): string {
  let code: string;
  do {
    code = generateCode();
  } while (RESERVED_CODES.has(code));
  return code;
}
