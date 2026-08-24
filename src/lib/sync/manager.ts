import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  SyncEngine,
  isSyncCancelledError,
  SyncCancelledError,
  WEB_SYNC_NEW_CHUNK_BUDGET,
  WEB_SYNC_RESTART_CHUNK_SIZE_BYTES,
} from './engine';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncResult } from './types';
import { deriveKey, DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';
import { base64ToUint8 } from '@/lib/encryption/utils';

const LAST_SYNC_PREFIX = 'canto:lastSync:';
const LAST_REMOTE_SALT_PREFIX = 'canto:lastRemoteSalt:';

export type SyncStatus = 'idle' | 'syncing' | 'checkpointed' | 'error';

export interface SyncProgress {
  current: number;
  total: number;
}

export interface SyncState {
  status: SyncStatus;
  lastSynced: number | null; // unix ms
  error?: string;
  errorStack?: string;
  progress?: SyncProgress;
}

export class SyncManager {
  private states = new Map<string, SyncState>();
  private locks = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private abortControllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();

  constructor(
    private local: LocalStore,
    private store: RemoteStore,
    private readonly webCheckpointing = Platform.OS === 'web',
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  getState(journalId: string): SyncState {
    return (
      this.states.get(journalId) ??
      (this.hasWebCheckpoint(journalId)
        ? { status: 'checkpointed', lastSynced: null }
        : { status: 'idle', lastSynced: null })
    );
  }

  private checkpointKey(journalId: string): string {
    return `canto:syncCheckpoint:${journalId}`;
  }

  /** sessionStorage survives reloads but is discarded with a fully closed tab. */
  private hasWebCheckpoint(journalId: string): boolean {
    return (
      this.webCheckpointing &&
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(this.checkpointKey(journalId)) === '1'
    );
  }

  private markWebCheckpoint(journalId: string): void {
    if (this.webCheckpointing && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.checkpointKey(journalId), '1');
    }
  }

  private setState(journalId: string, state: SyncState) {
    this.states.set(journalId, state);
    this.notify();
  }

  async connectWithToken(accessToken: string): Promise<void> {
    await this.store.connect({ accessToken });
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
  }

  /** Cancel a running or pending sync without altering its remote backup. */
  cancelSync(journalId: string): void {
    this.abortControllers.get(journalId)?.abort();

    const timer = this.debounceTimers.get(journalId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(journalId);
    }

    const state = this.getState(journalId);
    if (state.status === 'syncing') {
      this.setState(journalId, { status: 'idle', lastSynced: state.lastSynced });
    }
  }

  /** Cancel every active sync before the owning app context is torn down. */
  dispose(): void {
    for (const journalId of new Set([
      ...this.abortControllers.keys(),
      ...this.debounceTimers.keys(),
    ])) {
      this.cancelSync(journalId);
    }
  }

  /**
   * Record the remote registry salt for a journal — used by cloud import to seed
   * the lastKnownRemoteSalt so the next sync correctly identifies that local
   * matches remote.
   */
  async recordRemoteSalt(journalId: string, salt: string): Promise<void> {
    await AsyncStorage.setItem(LAST_REMOTE_SALT_PREFIX + journalId, salt);
  }

  /**
   * Clear all sync state for a journal. Called when a journal is deleted locally
   * so that a later recreate/re-import with the same ID does not inherit stale
   * salt/timestamp data.
   */
  async forgetJournal(journalId: string): Promise<void> {
    this.cancelSync(journalId);
    await AsyncStorage.removeItem(LAST_SYNC_PREFIX + journalId);
    await AsyncStorage.removeItem(LAST_REMOTE_SALT_PREFIX + journalId);
    this.states.delete(journalId);
    this.notify();
  }

  /** Restore the prior value if cancellation wins while AsyncStorage is writing. */
  private async persistForRun(
    key: string,
    value: string,
    controller: AbortController,
    isCurrentRun: () => boolean,
  ): Promise<void> {
    if (controller.signal.aborted || !isCurrentRun()) throw new SyncCancelledError();
    const previous = await AsyncStorage.getItem(key);
    if (controller.signal.aborted || !isCurrentRun()) throw new SyncCancelledError();
    await AsyncStorage.setItem(key, value);
    if (controller.signal.aborted || !isCurrentRun()) {
      if (previous == null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, previous);
      throw new SyncCancelledError();
    }
  }

  async syncJournal(
    journalId: string,
    accessToken: string,
    derivedKey?: Uint8Array,
  ): Promise<SyncResult | null> {
    if (this.locks.has(journalId)) return null;
    this.locks.add(journalId);
    const controller = new AbortController();
    this.abortControllers.set(journalId, controller);
    const throwIfCancelled = () => {
      if (controller.signal.aborted) throw new SyncCancelledError();
    };
    const isCurrentRun = () => this.abortControllers.get(journalId) === controller;

    // Load last sync time
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_PREFIX + journalId);
    if (controller.signal.aborted) {
      this.abortControllers.delete(journalId);
      this.locks.delete(journalId);
      return null;
    }
    const lastSynced = lastSyncStr ? parseInt(lastSyncStr, 10) : null;
    if (this.hasWebCheckpoint(journalId)) {
      this.setState(journalId, { status: 'checkpointed', lastSynced });
      this.abortControllers.delete(journalId);
      this.locks.delete(journalId);
      return null;
    }

    // Load last-known remote salt — used by engine to disambiguate "I changed
    // password locally" (push) from "another device changed password" (abort).
    const previousRemoteSalt =
      (await AsyncStorage.getItem(LAST_REMOTE_SALT_PREFIX + journalId)) ?? undefined;
    if (controller.signal.aborted) {
      this.abortControllers.delete(journalId);
      this.locks.delete(journalId);
      return null;
    }

    this.setState(journalId, { status: 'syncing', lastSynced });
    let chunkUploadWorkStarted = false;
    const markChunkUploadWorkStarted = () => {
      chunkUploadWorkStarted = true;
      // Set this before the local chunk read. A cancellation or recoverable
      // failure after WebCrypto/IndexedDB work must not permit another bounded
      // run in the same renderer.
      this.markWebCheckpoint(journalId);
    };

    try {
      await this.connectWithToken(accessToken);
      throwIfCancelled();
      const engine = new SyncEngine(this.local, this.store);

      // Ensure we always have a sync key. For password-protected journals the
      // caller provides derivedKey. For non-secure journals we derive a key
      // from the journal's salt with an empty password — this protects data
      // on GDrive against passive scraping.
      let syncKey = derivedKey;
      if (!syncKey) {
        const journals = await this.local.listJournals();
        throwIfCancelled();
        const journal = journals.find((j) => j.id === journalId);
        if (journal?.salt) {
          const saltBytes = base64ToUint8(journal.salt);
          syncKey = await deriveKey('', saltBytes, journal.kdfIterations ?? DEFAULT_KDF_ITERATIONS);
        } else {
          throw new Error(`[Sync] Journal ${journalId} has no salt — cannot derive sync key`);
        }
      }

      const result = await engine.sync(
        journalId,
        syncKey,
        (current, total) => {
          if (!controller.signal.aborted && isCurrentRun()) {
            this.setState(journalId, {
              status: 'syncing',
              lastSynced,
              progress: { current, total },
            });
          }
        },
        previousRemoteSalt,
        controller.signal,
        this.webCheckpointing
          ? {
              newChunkUploadBudget: WEB_SYNC_NEW_CHUNK_BUDGET,
              restartPartialUploadChunkSize: WEB_SYNC_RESTART_CHUNK_SIZE_BYTES,
              onChunkUploadWorkStarted: markChunkUploadWorkStarted,
            }
          : undefined,
      );
      throwIfCancelled();
      if (result.checkpointed || chunkUploadWorkStarted) {
        this.markWebCheckpoint(journalId);
        if (isCurrentRun()) {
          this.setState(journalId, { status: 'checkpointed', lastSynced });
        }
        return { ...result, checkpointed: true };
      }

      // After a successful sync, record the remote salt for future sync comparisons.
      // We re-fetch the registry to get the current state (which may have just been
      // updated by our sync if a key rotation happened).
      try {
        const remoteJournals = await this.store.listRemoteJournals();
        throwIfCancelled();
        const updatedRemote = remoteJournals.find((j) => j.id === journalId);
        if (updatedRemote?.salt) {
          await this.persistForRun(
            LAST_REMOTE_SALT_PREFIX + journalId,
            updatedRemote.salt,
            controller,
            isCurrentRun,
          );
        }
      } catch (err) {
        if (isSyncCancelledError(err)) throw err;
        // Non-fatal: missing salt record means next sync defaults to "no history" mode.
        // Log so it's visible in Sentry/console when debugging unexpected sync behavior.
        console.warn(`[Canto] Failed to record remote salt for ${journalId}:`, err);
      }

      const now = Date.now();
      await this.persistForRun(LAST_SYNC_PREFIX + journalId, String(now), controller, isCurrentRun);
      if (isCurrentRun()) {
        this.setState(journalId, { status: 'idle', lastSynced: now });
      }

      return result;
    } catch (err) {
      if (isSyncCancelledError(err) || controller.signal.aborted || !isCurrentRun()) {
        if (chunkUploadWorkStarted && isCurrentRun()) {
          this.setState(journalId, { status: 'checkpointed', lastSynced });
        }
        return null;
      }

      if (chunkUploadWorkStarted) {
        this.setState(journalId, { status: 'checkpointed', lastSynced });
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[Canto] Sync failed for ${journalId}:`, err);
      this.setState(journalId, {
        status: 'error',
        lastSynced: lastSynced ?? null,
        error: message,
        errorStack: stack,
      });
      return null;
    } finally {
      if (isCurrentRun()) this.abortControllers.delete(journalId);
      this.locks.delete(journalId);
    }
  }

  scheduleSyncDebounced(
    journalId: string,
    accessToken: string,
    derivedKey?: Uint8Array,
    delayMs = 5000,
  ) {
    if (this.hasWebCheckpoint(journalId)) {
      const state = this.getState(journalId);
      this.setState(journalId, { status: 'checkpointed', lastSynced: state.lastSynced });
      return;
    }
    const existing = this.debounceTimers.get(journalId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(journalId);
      this.syncJournal(journalId, accessToken, derivedKey).catch(() => {
        // Error already captured in state via syncJournal's catch block
      });
    }, delayMs);
    this.debounceTimers.set(journalId, timer);
  }

  async loadLastSynced(journalId: string): Promise<number | null> {
    const stored = await AsyncStorage.getItem(LAST_SYNC_PREFIX + journalId);
    return stored ? parseInt(stored, 10) : null;
  }

  getRemoteStore(): RemoteStore {
    return this.store;
  }
}
