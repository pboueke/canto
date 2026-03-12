import { createContext, useContext, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

const PBKDF2_ITERATIONS = 20_000;
const KEY_LENGTH = 32;

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface JournalKeyContextValue {
  deriveAndCache(journalId: string, password: string, saltBase64: string): Promise<Uint8Array>;
  getKey(journalId: string): Uint8Array | null;
  clearKey(journalId: string): void;
  clearAll(): void;
}

const JournalKeyContext = createContext<JournalKeyContextValue>({
  deriveAndCache: async () => new Uint8Array(0),
  getKey: () => null,
  clearKey: () => {},
  clearAll: () => {},
});

export function JournalKeyProvider({ children }: { children: ReactNode }) {
  const keysRef = useRef(new Map<string, Uint8Array>());

  const deriveAndCache = useCallback(
    async (journalId: string, password: string, saltBase64: string) => {
      const salt = base64ToUint8(saltBase64);
      const encoder = new TextEncoder();
      const key = await pbkdf2Async(sha256, encoder.encode(password), salt, {
        c: PBKDF2_ITERATIONS,
        dkLen: KEY_LENGTH,
      });
      keysRef.current.set(journalId, key);
      return key;
    },
    [],
  );

  const getKey = useCallback((journalId: string) => {
    return keysRef.current.get(journalId) ?? null;
  }, []);

  const clearKey = useCallback((journalId: string) => {
    const key = keysRef.current.get(journalId);
    if (key) {
      key.fill(0);
      keysRef.current.delete(journalId);
    }
  }, []);

  const clearAll = useCallback(() => {
    for (const key of keysRef.current.values()) {
      key.fill(0);
    }
    keysRef.current.clear();
  }, []);

  return (
    <JournalKeyContext.Provider value={{ deriveAndCache, getKey, clearKey, clearAll }}>
      {children}
    </JournalKeyContext.Provider>
  );
}

export function useJournalKeys(): JournalKeyContextValue {
  return useContext(JournalKeyContext);
}
