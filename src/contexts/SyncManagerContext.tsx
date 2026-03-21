import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { SyncManager, type SyncState } from '@/lib/sync/manager';
import { GDriveRemoteStore } from '@/lib/sync/gdrive';
import { getLocalStore } from '@/hooks/useStorage';
import type { SyncProvider, SyncResult } from '@/lib/sync';

interface SyncManagerCtxValue {
  syncJournal: (journalId: string, derivedKey?: Uint8Array) => Promise<SyncResult | null>;
  scheduleSyncDebounced: (journalId: string, derivedKey?: Uint8Array) => void;
  getSyncState: (journalId: string) => SyncState;
  manager: SyncManager | null;
  provider: SyncProvider | null;
}

const DEFAULT_STATE: SyncState = { status: 'idle', lastSynced: null };

const SyncManagerCtx = createContext<SyncManagerCtxValue>({
  syncJournal: async () => null,
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
  const managerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    (async () => {
      const store = await getLocalStore();
      managerRef.current = new SyncManager(store, new GDriveRemoteStore());
    })();
    return () => {
      managerRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      managerRef.current?.disconnect();
    }
  }, [accessToken]);

  const syncJournal = useCallback(
    async (journalId: string, derivedKey?: Uint8Array) => {
      if (!accessToken || !managerRef.current) return null;
      const token = await getAccessToken();
      if (!token) return null;
      return managerRef.current.syncJournal(journalId, token, derivedKey);
    },
    [accessToken, getAccessToken],
  );

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
      scheduleSyncDebounced,
      getSyncState,
      manager: managerRef.current,
      provider: currentProvider,
    }),
    [syncJournal, scheduleSyncDebounced, getSyncState, currentProvider],
  );

  return <SyncManagerCtx.Provider value={value}>{children}</SyncManagerCtx.Provider>;
}
