import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  SyncEngine,
  isSyncCancelledError,
  isSyncPasswordChangedElsewhereError,
  SyncCancelledError,
} from './engine';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore, SyncErrorCode, SyncResult, SyncRunOutcome } from './types';
import { deriveKey, DEFAULT_KDF_ITERATIONS } from '@/lib/encryption/password';
import { base64ToUint8 } from '@/lib/encryption/utils';
import { RendererWorkLedger } from './renderer-work-ledger';

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
  errorCode?: SyncErrorCode;
  errorStack?: string;
  progress?: SyncProgress;
  requiresFreshRenderer?: boolean;
}

export class SyncManager {
  private states = new Map<string, SyncState>();
  private locks = new Set<string>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private abortControllers = new Map<string, AbortController>();
  private listeners = new Set<() => void>();
  private readonly rendererWorkLedger: RendererWorkLedger | undefined;

  constructor(
    private local: LocalStore,
    private store: RemoteStore,
    private readonly webCheckpointing = Platform.OS === 'web',
  ) {
    this.rendererWorkLedger = this.webCheckpointing ? new RendererWorkLedger() : undefined;
  }

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
      (this.hasWebCheckpoint()
        ? { status: 'checkpointed', lastSynced: null, requiresFreshRenderer: true }
        : { status: 'idle', lastSynced: null })
    );
  }

  /** sessionStorage survives reloads but is discarded with a fully closed tab. */
  private hasWebCheckpoint(): boolean {
    return this.rendererWorkLedger?.requiresFreshRenderer === true;
  }

  private setState(journalId: string, state: SyncState) {
    this.states.set(journalId, state);
    this.notify();
  }

  async connectWithToken(
    accessToken: string,
    refreshAccessToken?: () => Promise<string | null>,
  ): Promise<void> {
    // `runJournalSync` installs its refresher before reconnecting through this
    // method. An ordinary reconnect must not clear that in-flight protection.
    if (refreshAccessToken) this.store.setAccessTokenRefresher?.(refreshAccessToken);
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

  /** Abort active work before JournalKeyProvider zeroes its cached keys. */
  cancelAllSyncs(): void {
    this.dispose();
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
    if (this.hasWebCheckpoint()) {
      this.setState(journalId, {
        status: 'checkpointed',
        lastSynced,
        requiresFreshRenderer: true,
      });
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
              rendererWorkLedger: this.rendererWorkLedger,
            }
          : undefined,
      );
      throwIfCancelled();
      if (result.checkpointed) {
        if (isCurrentRun()) {
          this.setState(journalId, {
            status: 'checkpointed',
            lastSynced,
            requiresFreshRenderer: true,
          });
        }
        return { ...result, checkpointed: true, requiresFreshRenderer: true };
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
        this.setState(journalId, {
          status: 'idle',
          lastSynced: now,
          ...(this.hasWebCheckpoint() ? { requiresFreshRenderer: true } : {}),
        });
      }

      return this.hasWebCheckpoint() ? { ...result, requiresFreshRenderer: true } : result;
    } catch (err) {
      if (isSyncCancelledError(err) || controller.signal.aborted || !isCurrentRun()) {
        if (isCurrentRun()) {
          this.setState(journalId, {
            status: 'idle',
            lastSynced,
            ...(this.hasWebCheckpoint() ? { requiresFreshRenderer: true } : {}),
          });
        }
        return null;
      }

      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const errorCode: SyncErrorCode | undefined = isSyncPasswordChangedElsewhereError(err)
        ? 'password-changed-elsewhere'
        : undefined;
      console.error(`[Canto] Sync failed for ${journalId}:`, err);
      this.setState(journalId, {
        status: 'error',
        lastSynced: lastSynced ?? null,
        error: message,
        errorCode,
        errorStack: stack,
        requiresFreshRenderer: this.hasWebCheckpoint(),
      });
      return null;
    } finally {
      if (isCurrentRun()) this.abortControllers.delete(journalId);
      this.locks.delete(journalId);
    }
  }

  /**
   * Classify every user-requested run without exposing the nullable legacy
   * result to UI callers. The raw `syncJournal` API remains available to
   * background scheduling and existing integrations.
   */
  async runJournalSync(
    journalId: string,
    accessToken: string,
    derivedKey?: Uint8Array,
    refreshAccessToken?: () => Promise<string | null>,
  ): Promise<SyncRunOutcome> {
    if (this.locks.has(journalId)) return { kind: 'already-running' };

    this.store.setAccessTokenRefresher?.(refreshAccessToken);
    try {
      const result = await this.syncJournal(journalId, accessToken, derivedKey);
      if (result) {
        return result.checkpointed
          ? { kind: 'checkpointed', result }
          : { kind: 'completed', result };
      }

      const state = this.getState(journalId);
      if (state.status === 'checkpointed' || state.requiresFreshRenderer) {
        return { kind: 'checkpointed' };
      }
      if (state.status === 'error') return { kind: 'failed', errorCode: state.errorCode };
      return { kind: 'cancelled' };
    } finally {
      this.store.setAccessTokenRefresher?.(undefined);
    }
  }

  scheduleSyncDebounced(
    journalId: string,
    accessToken: string,
    derivedKey?: Uint8Array,
    delayMs = 5000,
  ) {
    if (this.hasWebCheckpoint()) {
      const state = this.getState(journalId);
      this.setState(journalId, {
        status: 'checkpointed',
        lastSynced: state.lastSynced,
        requiresFreshRenderer: true,
      });
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
