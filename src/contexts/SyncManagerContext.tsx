import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { useJournalKeys } from './JournalKeyContext';
import { SyncManager, type SyncState } from '@/lib/sync/manager';
import { GDriveRemoteStore } from '@/lib/sync/gdrive';
import { getLocalStore } from '@/hooks/useStorage';
import type { SyncProvider, SyncRunOutcome } from '@/lib/sync';

interface SyncManagerCtxValue {
  syncJournal: (journalId: string, derivedKey?: Uint8Array) => Promise<SyncRunOutcome>;
  cancelSync: (journalId: string) => void;
  scheduleSyncDebounced: (journalId: string, derivedKey?: Uint8Array) => void;
  getSyncState: (journalId: string) => SyncState;
  manager: SyncManager | null;
  provider: SyncProvider | null;
}

const DEFAULT_STATE: SyncState = { status: 'idle', lastSynced: null };

const SyncManagerCtx = createContext<SyncManagerCtxValue>({
  syncJournal: async () => ({ kind: 'not-ready' }),
  cancelSync: () => {},
  scheduleSyncDebounced: () => {},
  getSyncState: () => DEFAULT_STATE,
  manager: null,
  provider: null,
});

export function useSyncManager() {
  return useContext(SyncManagerCtx);
}

/** Reactive hook — re-renders when sync state changes for a given journal */
export function useSyncState(journalId: string): SyncState {
  const { manager } = useContext(SyncManagerCtx);
  const lastRef = useRef<SyncState>(DEFAULT_STATE);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return manager?.subscribe(onStoreChange) ?? (() => {});
    },
    [manager],
  );

  const getSnapshot = useCallback(() => {
    const next = manager?.getState(journalId);
    if (!next) return lastRef.current === DEFAULT_STATE ? DEFAULT_STATE : lastRef.current;
    // Return same reference if state hasn't changed
    const prev = lastRef.current;
    if (
      prev.status === next.status &&
      prev.lastSynced === next.lastSynced &&
      prev.error === next.error &&
      prev.requiresFreshRenderer === next.requiresFreshRenderer &&
      prev.progress?.current === next.progress?.current &&
      prev.progress?.total === next.progress?.total
    ) {
      return prev;
    }
    lastRef.current = next;
    return next;
  }, [manager, journalId]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

export function SyncManagerProvider({ children }: { children: ReactNode }) {
  const { accessToken, getAccessToken, isSignedIn } = useGoogleAuth();
  const { onAutoLock } = useJournalKeys();
  const managerRef = useRef<SyncManager | null>(null);
  const [manager, setManager] = useState<SyncManager | null>(null);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const store = await getLocalStore();
      const nextManager = new SyncManager(store, new GDriveRemoteStore());
      if (disposed) {
        nextManager.dispose();
        await nextManager.disconnect();
        return;
      }
      managerRef.current = nextManager;
      setManager(nextManager);
    })();
    return () => {
      disposed = true;
      const activeManager = managerRef.current;
      managerRef.current = null;
      setManager(null);
      activeManager?.dispose();
      void activeManager?.disconnect();
    };
  }, []);

  useEffect(() => {
    return onAutoLock(() => {
      // JournalKeyProvider notifies listeners before it releases imported keys
      // and zeroes the source Uint8Arrays.
      managerRef.current?.cancelAllSyncs();
    });
  }, [onAutoLock]);

  useEffect(() => {
    if (!accessToken) {
      managerRef.current?.disconnect();
    }
  }, [accessToken]);

  const syncJournal = useCallback(
    async (journalId: string, derivedKey?: Uint8Array) => {
      const activeManager = managerRef.current;
      if (!activeManager) return { kind: 'not-ready' } as const;
      if (!accessToken) return { kind: 'authentication-required' } as const;
      const token = await getAccessToken();
      if (!token) return { kind: 'authentication-required' } as const;
      return activeManager.runJournalSync(journalId, token, derivedKey, getAccessToken);
    },
    [accessToken, getAccessToken],
  );

  const cancelSync = useCallback((journalId: string) => {
    managerRef.current?.cancelSync(journalId);
  }, []);

  const scheduleSyncDebounced = useCallback(
    (journalId: string, derivedKey?: Uint8Array) => {
      if (!accessToken || !managerRef.current) return;
      const manager = managerRef.current;
      getAccessToken()
        .then((token) => {
          if (token && managerRef.current === manager) {
            manager.scheduleSyncDebounced(journalId, token, derivedKey);
          }
        })
        .catch((err) => {
          console.error('[Canto] Failed to get access token for sync:', err);
        });
    },
    [accessToken, getAccessToken],
  );

  const getSyncState = useCallback((journalId: string): SyncState => {
    return managerRef.current?.getState(journalId) ?? DEFAULT_STATE;
  }, []);

  const currentProvider: SyncProvider | null = isSignedIn ? 'gdrive' : null;

  const value = useMemo(
    () => ({
      syncJournal,
      cancelSync,
      scheduleSyncDebounced,
      getSyncState,
      manager,
      provider: currentProvider,
    }),
    [syncJournal, cancelSync, scheduleSyncDebounced, getSyncState, manager, currentProvider],
  );

  return <SyncManagerCtx.Provider value={value}>{children}</SyncManagerCtx.Provider>;
}
