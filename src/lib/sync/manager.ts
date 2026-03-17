import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncEngine } from './engine';
import { GDriveRemoteStore } from './gdrive';
import type { LocalStore } from '@/lib/storage/types';
import type { SyncResult } from './types';

const LAST_SYNC_PREFIX = 'canto:lastSync:';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSynced: number | null; // unix ms
  error?: string;
}

export class SyncManager {
  private store: GDriveRemoteStore;
  private states = new Map<string, SyncState>();
  private locks = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();

  constructor(private local: LocalStore) {
    this.store = new GDriveRemoteStore();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  getState(journalId: string): SyncState {
    return this.states.get(journalId) ?? { status: 'idle', lastSynced: null };
  }

  private setState(journalId: string, state: SyncState) {
    this.states.set(journalId, state);
    this.notify();
  }

  async connectIfNeeded(accessToken: string): Promise<void> {
    if (!this.store.isConnected()) {
      await this.store.connect({ accessToken });
    }
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
  }

  async syncJournal(
    journalId: string,
    accessToken: string,
    _derivedKey?: Uint8Array,
  ): Promise<SyncResult | null> {
    if (this.locks.has(journalId)) return null;
    this.locks.add(journalId);

    // Load last sync time
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_PREFIX + journalId);
    const lastSynced = lastSyncStr ? parseInt(lastSyncStr, 10) : null;

    this.setState(journalId, { status: 'syncing', lastSynced });

    try {
      await this.connectIfNeeded(accessToken);
      const engine = new SyncEngine(this.local, this.store);
      const result = await engine.sync(journalId);

      const now = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_PREFIX + journalId, String(now));
      this.setState(journalId, { status: 'idle', lastSynced: now });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Canto] Sync failed for ${journalId}:`, message);
      this.setState(journalId, {
        status: 'error',
        lastSynced: lastSynced ?? null,
        error: message,
      });
      return null;
    } finally {
      this.locks.delete(journalId);
    }
  }

  scheduleSyncDebounced(
    journalId: string,
    accessToken: string,
    derivedKey?: Uint8Array,
    delayMs = 5000,
  ) {
    const existing = this.debounceTimers.get(journalId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(journalId);
      this.syncJournal(journalId, accessToken, derivedKey);
    }, delayMs);
    this.debounceTimers.set(journalId, timer);
  }

  async loadLastSynced(journalId: string): Promise<number | null> {
    const stored = await AsyncStorage.getItem(LAST_SYNC_PREFIX + journalId);
    return stored ? parseInt(stored, 10) : null;
  }

  getRemoteStore(): GDriveRemoteStore {
    return this.store;
  }
}
