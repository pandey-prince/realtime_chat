"use client";

import { unlockRoomKey } from "@/lib/e2e";
import { useCallback, useEffect, useState } from "react";

const sessionPassKey = (code: string) => `persist_e2e_pass_${code}`;

const memoryKeys = new Map<string, CryptoKey>();

export function useRoomE2eKey(code: string) {
  const [key, setKey] = useState<CryptoKey | null>(
    () => memoryKeys.get(code) ?? null,
  );
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    setKey(memoryKeys.get(code) ?? null);
    setUnlockError(null);
  }, [code]);

  const unlock = useCallback(
    async (passphrase: string, salt: string, verifier: string) => {
      setUnlocking(true);
      setUnlockError(null);
      try {
        const cryptoKey = await unlockRoomKey(passphrase, salt, verifier);
        if (!cryptoKey) {
          setUnlockError("Wrong passphrase.");
          return false;
        }
        memoryKeys.set(code, cryptoKey);
        setKey(cryptoKey);
        try {
          sessionStorage.setItem(sessionPassKey(code), passphrase);
        } catch {
          // sessionStorage may be unavailable
        }
        return true;
      } catch {
        setUnlockError("Could not unlock room.");
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [code],
  );

  const trySessionUnlock = useCallback(
    async (salt: string, verifier: string) => {
      if (memoryKeys.get(code)) {
        setKey(memoryKeys.get(code)!);
        return true;
      }
      let stored: string | null = null;
      try {
        stored = sessionStorage.getItem(sessionPassKey(code));
      } catch {
        return false;
      }
      if (!stored) return false;
      return unlock(stored, salt, verifier);
    },
    [code, unlock],
  );

  const clearKey = useCallback(() => {
    memoryKeys.delete(code);
    setKey(null);
    try {
      sessionStorage.removeItem(sessionPassKey(code));
    } catch {
      // ignore
    }
  }, [code]);

  return {
    key,
    unlocked: key !== null,
    unlock,
    trySessionUnlock,
    clearKey,
    unlockError,
    unlocking,
  };
}
