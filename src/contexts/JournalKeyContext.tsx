import { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { deriveKey, DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';
import { base64ToUint8, releaseAndZeroAesKey } from '@/lib/encryption/utils';
import {
  purgeAttachmentDisplayCache,
  purgeEncryptedAttachmentDisplayCache,
} from '@/lib/attachment-display';
import { getAutoLockTimeout } from '@/components/home/SecuritySettingsModal';

interface JournalKeyContextValue {
  deriveAndCache(
    journalId: string,
    password: string,
    saltBase64: string,
    iterations?: number,
  ): Promise<Uint8Array>;
  setKey(journalId: string, key: Uint8Array): void;
  getKey(journalId: string): Uint8Array | null;
  clearKey(journalId: string): void;
  clearAll(): void;
  touchActivity(): void;
  /** Subscribe to auto-lock events. Returns unsubscribe function. */
  onAutoLock(callback: () => void): () => void;
}

const JournalKeyContext = createContext<JournalKeyContextValue>({
  deriveAndCache: async () => new Uint8Array(0),
  setKey: () => {},
  getKey: () => null,
  clearKey: () => {},
  clearAll: () => {},
  touchActivity: () => {},
  onAutoLock: () => () => {},
});

export function JournalKeyProvider({ children }: { children: ReactNode }) {
  const keysRef = useRef(new Map<string, Uint8Array>());
  const lastActivityRef = useRef(Date.now());
  const backgroundedAtRef = useRef<number | null>(null);
  const clearAllRef = useRef<() => void>(() => {});
  const autoLockListenersRef = useRef(new Set<() => void>());

  const deriveAndCache = useCallback(
    async (journalId: string, password: string, saltBase64: string, iterations?: number) => {
      const salt = base64ToUint8(saltBase64);
      const key = await deriveKey(password, salt, iterations ?? DEFAULT_KDF_ITERATIONS);
      keysRef.current.set(journalId, key);
      return key;
    },
    [],
  );

  const setKey = useCallback((journalId: string, key: Uint8Array) => {
    keysRef.current.set(journalId, key);
  }, []);

  const getKey = useCallback((journalId: string) => {
    return keysRef.current.get(journalId) ?? null;
  }, []);

  const clearKey = useCallback((journalId: string) => {
    const key = keysRef.current.get(journalId);
    if (key) {
      // Display cache entries may contain decrypted bytes for this key. Paths
      // do not carry a journal id, so evict all completed leased displays.
      purgeAttachmentDisplayCache();
      releaseAndZeroAesKey(key);
      keysRef.current.delete(journalId);
    }
  }, []);

  const clearAll = useCallback(() => {
    purgeAttachmentDisplayCache();
    for (const key of keysRef.current.values()) {
      releaseAndZeroAesKey(key);
    }
    keysRef.current.clear();
  }, []);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const onAutoLock = useCallback((callback: () => void) => {
    autoLockListenersRef.current.add(callback);
    return () => {
      autoLockListenersRef.current.delete(callback);
    };
  }, []);

  const triggerAutoLock = useCallback(() => {
    for (const listener of autoLockListenersRef.current) {
      listener();
    }
    clearAll();
  }, [clearAll]);

  // Keep clearAllRef in sync so effects use the latest triggerAutoLock without re-registering
  clearAllRef.current = triggerAutoLock;

  // Auto-lock: check on app foreground resume
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        // A background transition can happen before the configured auto-lock
        // threshold. Remove password-encrypted display originals immediately
        // while retaining only the bounded unencrypted LRU cache.
        purgeEncryptedAttachmentDisplayCache();
        backgroundedAtRef.current = Date.now();
      } else if (state === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        const timeout = await getAutoLockTimeout();
        if (timeout > 0 && elapsed >= timeout && keysRef.current.size > 0) {
          clearAllRef.current();
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Auto-lock: periodic inactivity check while foregrounded
  useEffect(() => {
    const interval = setInterval(async () => {
      if (keysRef.current.size === 0) return;
      const timeout = await getAutoLockTimeout();
      if (timeout > 0 && Date.now() - lastActivityRef.current >= timeout) {
        clearAllRef.current();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <JournalKeyContext.Provider
      value={{ deriveAndCache, setKey, getKey, clearKey, clearAll, touchActivity, onAutoLock }}
    >
      {children}
    </JournalKeyContext.Provider>
  );
}

export function useJournalKeys(): JournalKeyContextValue {
  return useContext(JournalKeyContext);
}
