import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useGoogleAuth } from './GoogleAuthContext';
import { SyncManager, type SyncState } from '@/lib/sync/manager';
import { getLocalStore } from '@/hooks/useStorage';
import type { SyncResult } from '@/lib/sync';

interface SyncManagerCtxValue {
  syncJournal: (journalId: string, derivedKey?: Uint8Array) => Promise<SyncResult | null>;
  scheduleSyncDebounced: (journalId: string, derivedKey?: Uint8Array) => void;
  getSyncState: (journalId: string) => SyncState;
  manager: SyncManager | null;
}

const SyncManagerCtx = createContext<SyncManagerCtxValue>({
  syncJournal: async () => null,
  scheduleSyncDebounced: () => {},
  getSyncState: () => ({ status: 'idle', lastSynced: null }),
  manager: null,
});

export function useSyncManager() {
  return useContext(SyncManagerCtx);
}

export function SyncManagerProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useGoogleAuth();
  const managerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    (async () => {
      const store = await getLocalStore();
      managerRef.current = new SyncManager(store);
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
      return managerRef.current.syncJournal(journalId, accessToken, derivedKey);
    },
    [accessToken],
  );

  const scheduleSyncDebounced = useCallback(
    (journalId: string, derivedKey?: Uint8Array) => {
      if (!accessToken || !managerRef.current) return;
      managerRef.current.scheduleSyncDebounced(journalId, accessToken, derivedKey);
    },
    [accessToken],
  );

  const getSyncState = useCallback((journalId: string): SyncState => {
    return managerRef.current?.getState(journalId) ?? { status: 'idle', lastSynced: null };
  }, []);

  const value = useMemo(
    () => ({ syncJournal, scheduleSyncDebounced, getSyncState, manager: managerRef.current }),
    [syncJournal, scheduleSyncDebounced, getSyncState],
  );

  return <SyncManagerCtx.Provider value={value}>{children}</SyncManagerCtx.Provider>;
}
