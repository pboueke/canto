import { SyncManager, type SyncState } from '../sync/manager';
import type { LocalStore } from '../storage/types';
import type { Page, JournalContent } from '@/models';

// Mock AsyncStorage
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(asyncStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    asyncStore[key] = value;
    return Promise.resolve();
  }),
}));

// Mock the GDriveRemoteStore
jest.mock('../sync/gdrive', () => ({
  GDriveRemoteStore: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    listRemoteJournals: jest.fn().mockResolvedValue([]),
    uploadJournalMeta: jest.fn(),
    downloadJournalMeta: jest.fn().mockResolvedValue(null),
    uploadPage: jest.fn(),
    downloadPage: jest.fn().mockResolvedValue(null),
    deletePage: jest.fn(),
    uploadAttachment: jest.fn(),
    downloadAttachment: jest.fn(),
    deleteAttachment: jest.fn(),
  })),
}));

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
  pages,
  settings: {
    use24h: false,
    previewTags: true,
    previewThumbnail: true,
    previewIcons: true,
    filterBar: true,
    sort: 'descending',
    showMarkdownPlaceholder: true,
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
      const manager = new SyncManager(local);

      const state = manager.getState('j1');
      expect(state).toEqual({ status: 'idle', lastSynced: null });
    });

    it('notifies listeners when state changes', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);
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
      const manager = new SyncManager(local);
      const listener = jest.fn();

      const unsub = manager.subscribe(listener);
      unsub();
      await manager.syncJournal('j1', 'token');

      expect(listener).not.toHaveBeenCalled();
    });

    it('transitions through syncing → idle on success', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);
      const states: SyncState[] = [];

      manager.subscribe(() => states.push({ ...manager.getState('j1') }));
      await manager.syncJournal('j1', 'token');

      expect(states[0].status).toBe('syncing');
      expect(states[states.length - 1].status).toBe('idle');
      expect(states[states.length - 1].lastSynced).toBeGreaterThan(0);
    });

    it('transitions to error on failure', async () => {
      const local = createMockLocalStore(null);
      // getJournal returns null → engine returns empty result, but let's make connect throw
      (local.getJournal as jest.Mock).mockRejectedValueOnce(new Error('read failure'));
      const manager = new SyncManager(local);
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
      const manager = new SyncManager(local);
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
      const manager = new SyncManager(local);

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
      const manager = new SyncManager(local);

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
      (local.getJournal as jest.Mock).mockImplementation((id: string) => {
        if (id === 'j1') return Promise.resolve(j1);
        if (id === 'j2') return Promise.resolve(j2);
        return Promise.resolve(null);
      });
      const manager = new SyncManager(local);

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
      const manager = new SyncManager(local);

      await manager.syncJournal('j1', 'token');

      expect(asyncStore['canto:lastSync:j1']).toBeDefined();
      const stored = parseInt(asyncStore['canto:lastSync:j1'], 10);
      expect(stored).toBeGreaterThan(0);
    });

    it('loads lastSynced from AsyncStorage', async () => {
      asyncStore['canto:lastSync:j1'] = '1700000000000';
      const local = createMockLocalStore(null);
      const manager = new SyncManager(local);

      const lastSynced = await manager.loadLastSynced('j1');
      expect(lastSynced).toBe(1700000000000);
    });

    it('returns null for never-synced journals', async () => {
      const local = createMockLocalStore(null);
      const manager = new SyncManager(local);

      const lastSynced = await manager.loadLastSynced('j1');
      expect(lastSynced).toBeNull();
    });
  });

  describe('derivedKey passthrough', () => {
    it('passes derivedKey to local.getJournal', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);
      const key = new Uint8Array(32);

      await manager.syncJournal('j1', 'token', key);

      expect(local.getJournal).toHaveBeenCalledWith('j1', key);
    });

    it('passes derivedKey to local.savePage when downloading', async () => {
      const remotePage = makePage('p1', 1000);
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);
      const key = new Uint8Array(32);

      // Make the remote store return a page to download
      const remoteStore = manager.getRemoteStore();
      (remoteStore.downloadJournalMeta as jest.Mock).mockResolvedValueOnce(
        makeJournal([remotePage]),
      );
      (remoteStore.downloadPage as jest.Mock).mockResolvedValueOnce(remotePage);

      await manager.syncJournal('j1', 'token', key);

      expect(local.savePage).toHaveBeenCalledWith('j1', remotePage, key);
    });
  });

  describe('token management', () => {
    it('connects with token before each sync', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);
      const store = manager.getRemoteStore();

      await manager.syncJournal('j1', 'token-1');
      expect(store.connect).toHaveBeenCalledWith({ accessToken: 'token-1' });

      await manager.syncJournal('j1', 'token-2');
      expect(store.connect).toHaveBeenCalledWith({ accessToken: 'token-2' });
    });
  });

  describe('debounced sync', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('debounces sync calls', async () => {
      const journal = makeJournal([]);
      const local = createMockLocalStore(journal);
      const manager = new SyncManager(local);

      // Schedule three syncs rapidly
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);
      manager.scheduleSyncDebounced('j1', 'token', undefined, 1000);

      // Only the last one should fire
      jest.advanceTimersByTime(1000);

      // Flush the promise queue so the async sync completes
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // getJournal should be called once (from the single sync that fires)
      expect(local.getJournal).toHaveBeenCalledTimes(1);
    });
  });
});
