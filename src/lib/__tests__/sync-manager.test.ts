import { SyncManager, type SyncState } from '../sync/manager';
import type { LocalStore } from '../storage/types';
import type { RemoteStore } from '../sync/types';
import type { Page, JournalContent } from 'canto-data';

// Mock encryption as passthrough
jest.mock('../encryption/utils', () => ({
  ...jest.requireActual('../encryption/utils'),
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));

// Mock password key derivation as passthrough (returns a fixed 32-byte key)
jest.mock('../encryption/password', () => ({
  ...jest.requireActual('../encryption/password'),
  deriveKey: jest.fn(() => Promise.resolve(new Uint8Array(32).fill(0xab))),
}));

// Mock AsyncStorage
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(asyncStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    asyncStore[key] = value;
    return Promise.resolve();
  }),
}));

function createMockRemoteStore(): RemoteStore {
  return {
    provider: 'gdrive',
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    isRemotePath: jest.fn((path: string) => path.startsWith('gdrive://')),
    buildRemotePath: jest.fn(
      (journalId: string, filename: string) => `gdrive://${journalId}/attachments/${filename}`,
    ),
    listRemoteJournals: jest.fn().mockResolvedValue([]),
    uploadJournalMeta: jest.fn(),
    downloadJournalMeta: jest.fn().mockResolvedValue(null),
    uploadPage: jest.fn(),
    downloadPage: jest.fn().mockResolvedValue(null),
    deletePage: jest.fn(),
    uploadSyncIndex: jest.fn(),
    downloadSyncIndex: jest.fn().mockResolvedValue(null),
    uploadAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    deleteJournal: jest.fn(),
  };
}

const makePage = (id: string, modified: number, deleted = false): Page => ({
  id,
  text: `Page ${id}`,
  date: '2026-03-12T10:00:00Z',
  tags: [],
  files: [],
  images: [],
  comments: [],
  modified,
  deleted,
});

const makeJournal = (pages: Page[]): JournalContent => ({
  id: 'j1',
  title: 'Test',
  icon: 'book',
  date: '2026-01-01T00:00:00Z',
  secure: false,
  salt: 'dGVzdHNhbHQ=',
  pages,
  settings: {
    use24h: false,
    previewTags: true,
    previewThumbnail: true,
    previewIcons: true,
    filterBar: true,
    sort: 'descending',
    autoLocation: false,
    remoteSync: true,
    autoSync: false,
  },
  version: 1,
});

function createMockLocalStore(journal: JournalContent | null): LocalStore {
  return {
    initialize: jest.fn(),
    listJournals: jest.fn().mockResolvedValue(journal ? [journal] : []),
    getJournal: jest.fn().mockResolvedValue(journal),
    saveJournal: jest.fn(),
    deleteJournal: jest.fn(),
    getPage: jest.fn().mockResolvedValue(null),
    savePage: jest.fn(),
    deletePage: jest.fn(),
    saveAttachment: jest.fn(),
    getAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
    reencryptJournal: jest.fn(),
    reencryptAll: jest.fn(),
  };
}

beforeEach(() => {
  Object.keys(asyncStore).forEach((k) => delete asyncStore[k]);
});

describe('SyncManager', () => {
  describe('state management', () => {
    it('returns idle state by default', () => {
      const local = createMockLocalStore(null);
      const manager = new SyncManager(local, createMockRemoteStore());

      const state = manager.getState('j1');
      expect(state).toEqual({ status: 'idle', lastSynced: null });
    });

    it('notifies listeners when state changes', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const listener = jest.fn();

      manager.subscribe(listener);
      await manager.syncJournal('j1', 'token');

      // At minimum: syncing → idle
      expect(listener).toHaveBeenCalled();
      expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('unsubscribe stops notifications', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const listener = jest.fn();

      const unsub = manager.subscribe(listener);
      unsub();
      await manager.syncJournal('j1', 'token');

      expect(listener).not.toHaveBeenCalled();
    });

    it('transitions through syncing → idle on success', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const states: SyncState[] = [];

      manager.subscribe(() => states.push({ ...manager.getState('j1') }));
      await manager.syncJournal('j1', 'token');

      expect(states[0].status).toBe('syncing');
      expect(states[states.length - 1].status).toBe('idle');
      expect(states[states.length - 1].lastSynced).toBeGreaterThan(0);
    });

    it('transitions to error on failure', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('read failure'));
      const manager = new SyncManager(local, createMockRemoteStore());
      const states: SyncState[] = [];

      manager.subscribe(() => states.push({ ...manager.getState('j1') }));
      await manager.syncJournal('j1', 'token');

      const lastState = states[states.length - 1];
      expect(lastState.status).toBe('error');
      expect(lastState.error).toContain('read failure');
    });
  });

  describe('progress tracking', () => {
    it('reports progress during sync', async () => {
      const pages = [makePage('p1', 1000), makePage('p2', 2000), makePage('p3', 3000)];
      const journal = makeJournal(pages);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const progressUpdates: Array<{ current: number; total: number }> = [];

      manager.subscribe(() => {
        const state = manager.getState('j1');
        if (state.progress) {
          progressUpdates.push({ ...state.progress });
        }
      });

      await manager.syncJournal('j1', 'token');

      // Should have progress updates for each page
      expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
      const last = progressUpdates[progressUpdates.length - 1];
      expect(last.current).toBe(3);
      expect(last.total).toBe(3);
    });

    it('progress is cleared after sync completes', async () => {
      const journal = makeJournal([makePage('p1', 1000)]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      const state = manager.getState('j1');
      expect(state.status).toBe('idle');
      expect(state.progress).toBeUndefined();
    });
  });

  describe('concurrent sync prevention', () => {
    it('prevents concurrent syncs for the same journal', async () => {
      const journal = makeJournal([makePage('p1', 1000)]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      // Start two syncs at the same time
      const [result1, result2] = await Promise.all([
        manager.syncJournal('j1', 'token'),
        manager.syncJournal('j1', 'token'),
      ]);

      // One should succeed, the other should be null (locked out)
      const results = [result1, result2];
      expect(results.filter((r) => r === null)).toHaveLength(1);
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it('allows syncing different journals concurrently', async () => {
      const j1 = makeJournal([makePage('p1', 1000)]);
      const j2 = { ...makeJournal([makePage('p2', 2000)]), id: 'j2' };
      const local = createMockLocalStore(j1);
      (local.listJournals as jest.Mock).mockResolvedValue([j1, j2]);
      (local.getJournal as jest.Mock).mockImplementation((id: string) => {
        if (id === 'j1') return Promise.resolve(j1);
        if (id === 'j2') return Promise.resolve(j2);
        return Promise.resolve(null);
      });
      const manager = new SyncManager(local, createMockRemoteStore());

      const [r1, r2] = await Promise.all([
        manager.syncJournal('j1', 'token'),
        manager.syncJournal('j2', 'token'),
      ]);

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
    });
  });

  describe('lastSynced persistence', () => {
    it('stores lastSynced in AsyncStorage', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(asyncStore['canto:lastSync:j1']).toBeDefined();
      const stored = parseInt(asyncStore['canto:lastSync:j1'], 10);
      expect(stored).toBeGreaterThan(0);
    });

    it('loads lastSynced from AsyncStorage', async () => {
      asyncStore['canto:lastSync:j1'] = '1700000000000';
      const local = createMockLocalStore(null);
      const manager = new SyncManager(local, createMockRemoteStore());

      const lastSynced = await manager.loadLastSynced('j1');
      expect(lastSynced).toBe(1700000000000);
    });

    it('returns null for never-synced journals', async () => {
      const local = createMockLocalStore(null);
      const manager = new SyncManager(local, createMockRemoteStore());

      const lastSynced = await manager.loadLastSynced('j1');
      expect(lastSynced).toBeNull();
    });
  });

  describe('derivedKey passthrough', () => {
    it('passes derivedKey to local.getJournal', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const key = new Uint8Array(32);

      await manager.syncJournal('j1', 'token', key);

      expect(local.getJournal).toHaveBeenCalledWith('j1', key);
    });

    it('passes derivedKey to local.savePage when downloading', async () => {
      const remotePage = makePage('p1', 1000);
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore();
      const manager = new SyncManager(local, remote);
      const key = new Uint8Array(32);

      // Make the remote store return a page to download via sync index
      (remote.downloadSyncIndex as jest.Mock).mockResolvedValueOnce({
        p1: { modified: 1000 },
      });
      (remote.downloadPage as jest.Mock).mockResolvedValueOnce(JSON.stringify(remotePage));

      await manager.syncJournal('j1', 'token', key);

      expect(local.savePage).toHaveBeenCalledWith('j1', remotePage, key, true);
    });
  });

  describe('syncKey derivation iterations', () => {
    it('uses DEFAULT_KDF_ITERATIONS when journal.kdfIterations is undefined', async () => {
      const { deriveKey } = require('../encryption/password');
      const { DEFAULT_KDF_ITERATIONS } = jest.requireActual('../encryption/password');
      const journal = makeJournal([]);
      // kdfIterations is undefined on this journal
      expect(journal.kdfIterations).toBeUndefined();

      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(deriveKey).toHaveBeenCalledWith('', expect.any(Uint8Array), DEFAULT_KDF_ITERATIONS);
    });

    it('uses journal.kdfIterations when present', async () => {
      const { deriveKey } = require('../encryption/password');
      const journal = { ...makeJournal([]), kdfIterations: 100_000 };
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(deriveKey).toHaveBeenCalledWith('', expect.any(Uint8Array), 100_000);
    });
  });

  describe('token management', () => {
    it('connects with token before each sync', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const remote = createMockRemoteStore();
      const manager = new SyncManager(local, remote);

      await manager.syncJournal('j1', 'token-1');
      expect(remote.connect).toHaveBeenCalledWith({ accessToken: 'token-1' });

      await manager.syncJournal('j1', 'token-2');
      expect(remote.connect).toHaveBeenCalledWith({ accessToken: 'token-2' });
    });
  });

  describe('error recovery', () => {
    it('returns to idle after error — can retry sync', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      // First sync fails
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('network'));
      await manager.syncJournal('j1', 'token');
      expect(manager.getState('j1').status).toBe('error');

      // Retry succeeds (getJournal back to normal)
      (local.getJournal as jest.Mock).mockResolvedValueOnce(journal);
      const result = await manager.syncJournal('j1', 'token');
      expect(result).not.toBeNull();
      expect(manager.getState('j1').status).toBe('idle');
    });

    it('preserves lastSynced from before the error', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      // First sync succeeds
      await manager.syncJournal('j1', 'token');
      const lastSynced = manager.getState('j1').lastSynced;
      expect(lastSynced).toBeGreaterThan(0);

      // Second sync fails
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await manager.syncJournal('j1', 'token');

      const errorState = manager.getState('j1');
      expect(errorState.status).toBe('error');
      expect(errorState.lastSynced).toBe(lastSynced);
    });

    it('error message is captured in state', async () => {
      const local = createMockLocalStore(makeJournal([]));
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('Drive API error (401)'));
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(manager.getState('j1').error).toBe('Drive API error (401)');
    });

    it('non-Error throws are captured as strings', async () => {
      const local = createMockLocalStore(makeJournal([]));
      (local.getJournal as jest.Mock).mockRejectedValueOnce('string error');
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(manager.getState('j1').error).toBe('string error');
    });

    it('captures errorStack from Error objects', async () => {
      const local = createMockLocalStore(makeJournal([]));
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('stack test'));
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(manager.getState('j1').errorStack).toBeDefined();
      expect(manager.getState('j1').errorStack).toContain('stack test');
    });

    it('errorStack is undefined for non-Error throws', async () => {
      const local = createMockLocalStore(makeJournal([]));
      (local.getJournal as jest.Mock).mockRejectedValueOnce('plain string');
      const manager = new SyncManager(local, createMockRemoteStore());

      await manager.syncJournal('j1', 'token');

      expect(manager.getState('j1').errorStack).toBeUndefined();
    });
  });

  describe('multiple listeners', () => {
    it('notifies all listeners on state change', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      manager.subscribe(listener1);
      manager.subscribe(listener2);
      await manager.syncJournal('j1', 'token');

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('unsubscribing one listener does not affect others', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsub1 = manager.subscribe(listener1);
      manager.subscribe(listener2);
      unsub1();
      await manager.syncJournal('j1', 'token');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('debounced sync', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('debounces sync calls', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local, createMockRemoteStore());

      // Schedule three syncs rapidly
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);

      // Only the last one should fire
      jest.advanceTimersByTime(1000);

      // Flush the promise queue so the async sync completes
      // Switch to real timers to await the full async chain
      jest.useRealTimers();
      await new Promise((r) => setTimeout(r, 50));
      jest.useFakeTimers();

      // getJournal called twice per sync: once by engine for content, once for sync index update
      expect(local.getJournal).toHaveBeenCalledTimes(2);
      // listJournals called once to resolve sync key from salt
      expect(local.listJournals).toHaveBeenCalledTimes(1);
    });

    it('debounced sync errors are captured in state (not unhandled)', async () => {
      const local = createMockLocalStore(makeJournal([]));
      (local.getJournal as jest.Mock).mockRejectedValue(new Error('debounce fail'));
      const remote = createMockRemoteStore();
      const manager = new SyncManager(local, remote);

      manager.scheduleSyncDebounced('j1', 'token', undefined, 100);

      // Advance past the debounce delay
      jest.advanceTimersByTime(100);

      // The debounced callback fires syncJournal which is async.
      // We need to flush microtasks until the async chain completes.
      // Use real timers temporarily to await the async work.
      jest.useRealTimers();
      // Wait for the async sync to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(manager.getState('j1').status).toBe('error');
      expect(manager.getState('j1').error).toBe('debounce fail');

      jest.useFakeTimers();
    });
  });
});
