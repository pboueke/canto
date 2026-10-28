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
export interface OverlayState {
  covered: boolean;
  locked: boolean;
}

const NO_OVERLAY: OverlayState = { covered: false, locked: false };

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
  /**
   * Run async work (an encrypted draft flush) after the lock screen is shown
   * but before key material is zeroed. Bounded by BEFORE_LOCK_TIMEOUT_MS.
   */
  onBeforeLock(handler: () => Promise<void>): () => void;
  /** True while journal content must stay covered (background, or resume pending a lock decision). */
  isPrivacyCovered(): boolean;
  /**
   * Overlay state shared by every privacy shield: `covered` while content
   * must be hidden, `locked` from an auto-lock until the lock screen is
   * dismissed. The object identity changes only when a field changes.
   */
  getOverlayState(): OverlayState;
  /** Subscribe to overlay changes (covered or locked). */
  subscribePrivacyCover(listener: () => void): () => void;
  /** Close the lock screen; the caller navigates back to the journal list. */
  dismissLockScreen(): void;
  /** Capture the current key epoch for a mounted editor. */
  createLease(journalId: string): KeyLease;
  /** True only while that journal's key epoch is unchanged and writable. */
  isLeaseValid(lease: KeyLease): boolean;
  /**
   * Keep this journal's key for reading only: no record could confirm the
   * password, so nothing may be written under it. Cleared with the key.
   */
  markReadOnly(journalId: string): void;
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
  onBeforeLock: () => () => {},
  isPrivacyCovered: () => false,
  getOverlayState: () => NO_OVERLAY,
  subscribePrivacyCover: () => () => {},
  dismissLockScreen: () => {},
  createLease: () => ({ journalId: '', epoch: 0 }),
  isLeaseValid: () => false,
  markReadOnly: () => {},
  onJournalLocked: () => () => {},
});

/** Upper bound on pre-lock draft flushes; the lock always completes. */
export const BEFORE_LOCK_TIMEOUT_MS = 3_000;

export function JournalKeyProvider({ children }: { children: ReactNode }) {
  const keysRef = useRef(new Map<string, Uint8Array>());
  const lastActivityRef = useRef(Date.now());
  const backgroundedAtRef = useRef<number | null>(null);
  // Bumped on every background transition: only the resume that started last
  // may lift the cover, so an overlapping background is never uncovered.
  const coverGenerationRef = useRef(0);
  const clearAllRef = useRef<() => Promise<void>>(async () => {});
  const autoLockListenersRef = useRef(new Set<() => void>());
  const beforeLockHandlersRef = useRef(new Set<() => Promise<void>>());
  const overlayRef = useRef<OverlayState>(NO_OVERLAY);
  const privacyListenersRef = useRef(new Set<() => void>());
  const journalLockListenersRef = useRef(new Map<string, Set<() => void>>());
  const epochsRef = useRef(new Map<string, number>());
  const readOnlyRef = useRef(new Set<string>());

  const bumpEpoch = useCallback((journalId: string): number => {
    // Any key change (new password, lock) ends a read-only grant.
    readOnlyRef.current.delete(journalId);
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
    if (readOnlyRef.current.has(lease.journalId)) return false;
    return epochsRef.current.get(lease.journalId) === lease.epoch;
  }, []);

  const markReadOnly = useCallback((journalId: string) => {
    readOnlyRef.current.add(journalId);
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

  const onBeforeLock = useCallback((handler: () => Promise<void>) => {
    beforeLockHandlersRef.current.add(handler);
    return () => {
      beforeLockHandlersRef.current.delete(handler);
    };
  }, []);

  const updateOverlay = useCallback((patch: Partial<OverlayState>) => {
    const next = { ...overlayRef.current, ...patch };
    if (next.covered === overlayRef.current.covered && next.locked === overlayRef.current.locked) {
      return;
    }
    overlayRef.current = next;
    for (const listener of privacyListenersRef.current) listener();
  }, []);

  const setPrivacyCovered = useCallback(
    (covered: boolean) => updateOverlay({ covered }),
    [updateOverlay],
  );

  const isPrivacyCovered = useCallback(() => overlayRef.current.covered, []);
  const getOverlayState = useCallback(() => overlayRef.current, []);
  const dismissLockScreen = useCallback(() => updateOverlay({ locked: false }), [updateOverlay]);

  const subscribePrivacyCover = useCallback((listener: () => void) => {
    privacyListenersRef.current.add(listener);
    return () => {
      privacyListenersRef.current.delete(listener);
    };
  }, []);

  const triggerAutoLock = useCallback(async () => {
    // The opaque lock screen goes up first, synchronously, so no content is
    // visible while drafts flush.
    updateOverlay({ locked: true });
    for (const listener of autoLockListenersRef.current) {
      listener();
    }
    // Editors persist their unsaved draft, encrypted, while the key is still
    // valid. A slow or failing flush never delays the lock past the bound.
    const handlers = [...beforeLockHandlersRef.current];
    if (handlers.length > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled(handlers.map((handler) => handler())),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, BEFORE_LOCK_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
    }
    clearAll();
  }, [clearAll, updateOverlay]);

  // Keep clearAllRef in sync so effects use the latest triggerAutoLock without re-registering
  clearAllRef.current = triggerAutoLock;

  // Auto-lock: check on app foreground resume
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        // Cover journal content before the OS can snapshot the app switcher.
        coverGenerationRef.current++;
        setPrivacyCovered(true);
        // A background transition can happen before the configured auto-lock
        // threshold. Remove password-encrypted display originals immediately
        // while retaining only the bounded unencrypted LRU cache.
        purgeEncryptedAttachmentDisplayCache();
        // iOS reports inactive before background; keep the earliest moment.
        backgroundedAtRef.current ??= Date.now();
      } else if (state === 'active') {
        const generation = coverGenerationRef.current;
        if (backgroundedAtRef.current !== null) {
          const elapsed = Date.now() - backgroundedAtRef.current;
          backgroundedAtRef.current = null;
          // Content stays covered until this decision is made, so a lock that
          // is due never reveals the page first.
          try {
            const timeout = await getAutoLockTimeout();
            if (timeout > 0 && elapsed >= timeout && keysRef.current.size > 0) {
              await clearAllRef.current();
            }
          } finally {
            if (generation === coverGenerationRef.current) setPrivacyCovered(false);
          }
        } else {
          setPrivacyCovered(false);
        }
      }
    });
    return () => subscription.remove();
  }, [setPrivacyCovered]);

  // Auto-lock: periodic inactivity check while foregrounded
  useEffect(() => {
    const interval = setInterval(async () => {
      if (keysRef.current.size === 0) return;
      const timeout = await getAutoLockTimeout();
      if (timeout > 0 && Date.now() - lastActivityRef.current >= timeout) {
        void clearAllRef.current();
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
        onBeforeLock,
        isPrivacyCovered,
        getOverlayState,
        subscribePrivacyCover,
        dismissLockScreen,
        createLease,
        isLeaseValid,
        markReadOnly,
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
