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

/**
 * A revocable write-capability for one journal. The lease captures the key
 * epoch at mount time; clearKey/clearAll bump the epoch *before* zeroing key
 * material, so an already-mounted editor can never keep writing with a
 * revoked (zeroed) key after an auto-lock.
 */
export interface KeyLease {
  journalId: string;
  epoch: number;
}

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
  /** Capture the current key epoch for a mounted editor. */
  createLease(journalId: string): KeyLease;
  /** True only while that journal's key epoch is unchanged. */
  isLeaseValid(lease: KeyLease): boolean;
  /** Notify mounted screens when this journal's key is revoked/locked. */
  onJournalLocked(journalId: string, callback: () => void): () => void;
}

const JournalKeyContext = createContext<JournalKeyContextValue>({
  deriveAndCache: async () => new Uint8Array(0),
  setKey: () => {},
  getKey: () => null,
  clearKey: () => {},
  clearAll: () => {},
  touchActivity: () => {},
  onAutoLock: () => () => {},
  createLease: () => ({ journalId: '', epoch: 0 }),
  isLeaseValid: () => false,
  onJournalLocked: () => () => {},
});

export function JournalKeyProvider({ children }: { children: ReactNode }) {
  const keysRef = useRef(new Map<string, Uint8Array>());
  const lastActivityRef = useRef(Date.now());
  const backgroundedAtRef = useRef<number | null>(null);
  const clearAllRef = useRef<() => void>(() => {});
  const autoLockListenersRef = useRef(new Set<() => void>());
  const journalLockListenersRef = useRef(new Map<string, Set<() => void>>());
  const epochsRef = useRef(new Map<string, number>());

  const bumpEpoch = useCallback((journalId: string): number => {
    const next = (epochsRef.current.get(journalId) ?? 0) + 1;
    epochsRef.current.set(journalId, next);
    return next;
  }, []);

  const notifyJournalLocked = useCallback((journalId: string) => {
    for (const listener of journalLockListenersRef.current.get(journalId) ?? []) {
      listener();
    }
  }, []);

  const deriveAndCache = useCallback(
    async (journalId: string, password: string, saltBase64: string, iterations?: number) => {
      const salt = base64ToUint8(saltBase64);
      const key = await deriveKey(password, salt, iterations ?? DEFAULT_KDF_ITERATIONS);
      bumpEpoch(journalId);
      keysRef.current.set(journalId, key);
      return key;
    },
    [bumpEpoch],
  );

  const setKey = useCallback(
    (journalId: string, key: Uint8Array) => {
      bumpEpoch(journalId);
      keysRef.current.set(journalId, key);
    },
    [bumpEpoch],
  );

  const getKey = useCallback((journalId: string) => {
    return keysRef.current.get(journalId) ?? null;
  }, []);

  const clearKey = useCallback(
    (journalId: string) => {
      const key = keysRef.current.get(journalId);
      if (key) {
        // Display cache entries may contain decrypted bytes for this key. Paths
        // do not carry a journal id, so evict all completed leased displays.
        purgeAttachmentDisplayCache();
        bumpEpoch(journalId);
        notifyJournalLocked(journalId);
        releaseAndZeroAesKey(key);
        keysRef.current.delete(journalId);
      }
    },
    [bumpEpoch, notifyJournalLocked],
  );

  const clearAll = useCallback(() => {
    purgeAttachmentDisplayCache();
    for (const journalId of keysRef.current.keys()) {
      bumpEpoch(journalId);
      notifyJournalLocked(journalId);
    }
    for (const key of keysRef.current.values()) {
      releaseAndZeroAesKey(key);
    }
    keysRef.current.clear();
  }, [bumpEpoch, notifyJournalLocked]);

  const createLease = useCallback((journalId: string): KeyLease => {
    return { journalId, epoch: epochsRef.current.get(journalId) ?? 0 };
  }, []);

  const isLeaseValid = useCallback((lease: KeyLease): boolean => {
    return epochsRef.current.get(lease.journalId) === lease.epoch;
  }, []);

  const onJournalLocked = useCallback((journalId: string, callback: () => void) => {
    const listeners = journalLockListenersRef.current.get(journalId) ?? new Set<() => void>();
    listeners.add(callback);
    journalLockListenersRef.current.set(journalId, listeners);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) journalLockListenersRef.current.delete(journalId);
    };
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
      value={{
        deriveAndCache,
        setKey,
        getKey,
        clearKey,
        clearAll,
        touchActivity,
        onAutoLock,
        createLease,
        isLeaseValid,
        onJournalLocked,
      }}
    >
      {children}
    </JournalKeyContext.Provider>
  );
}

export function useJournalKeys(): JournalKeyContextValue {
  return useContext(JournalKeyContext);
}
