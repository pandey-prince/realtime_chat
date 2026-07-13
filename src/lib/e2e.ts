const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_INFO = "safechat-e2e-v1";
const PLAINTEXT_MAX = 1000;
const CIPHERTEXT_MAX = 8192;

export const PASSPHRASE_MIN = 8;
export const PASSPHRASE_MAX = 128;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function validatePassphrase(raw: string): string | null {
  const passphrase = raw.trim();
  if (passphrase.length < PASSPHRASE_MIN || passphrase.length > PASSPHRASE_MAX) {
    return null;
  }
  return passphrase;
}

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return bytesToBase64Url(salt);
}

async function importPasswordKey(passphrase: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
}

export async function deriveKey(
  passphrase: string,
  saltB64: string,
): Promise<CryptoKey> {
  const baseKey = await importPasswordKey(passphrase);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64UrlToBytes(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveHmacKey(
  passphrase: string,
  saltB64: string,
): Promise<CryptoKey> {
  const baseKey = await importPasswordKey(passphrase);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64UrlToBytes(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign"],
  );
}

export async function makeVerifier(
  passphrase: string,
  saltB64: string,
): Promise<string> {
  const hmacKey = await deriveHmacKey(passphrase, saltB64);
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(VERIFIER_INFO),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyPassphrase(
  passphrase: string,
  saltB64: string,
  expectedVerifier: string,
): Promise<boolean> {
  const actual = await makeVerifier(passphrase, saltB64);
  return timingSafeEqual(actual, expectedVerifier);
}

export async function unlockRoomKey(
  passphrase: string,
  saltB64: string,
  verifier: string,
): Promise<CryptoKey | null> {
  const ok = await verifyPassphrase(passphrase, saltB64, verifier);
  if (!ok) return null;
  return deriveKey(passphrase, saltB64);
}

export async function encryptText(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  if (plaintext.length > PLAINTEXT_MAX) {
    throw new Error("Message too long");
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const wire = `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipherBuf))}`;
  if (wire.length > CIPHERTEXT_MAX) {
    throw new Error("Encrypted message too long");
  }
  return wire;
}

export async function decryptText(
  key: CryptoKey,
  wire: string,
): Promise<string> {
  const parts = wire.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported ciphertext format");
  }

  const iv = base64UrlToBytes(parts[1]!);
  const ciphertext = base64UrlToBytes(parts[2]!);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ciphertext as BufferSource,
  );
  return new TextDecoder().decode(plainBuf);
}

export function isCiphertextWire(text: string): boolean {
  return text.startsWith("v1.") && text.split(".").length === 3;
}

export async function prepareRoomE2eMaterial(passphrase: string): Promise<{
  e2eSalt: string;
  e2eVerifier: string;
}> {
  const e2eSalt = generateSalt();
  const e2eVerifier = await makeVerifier(passphrase, e2eSalt);
  return { e2eSalt, e2eVerifier };
}
