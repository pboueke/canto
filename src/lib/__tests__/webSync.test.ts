/**
 * Integration test: verify that the sync stack (SyncManager + GDriveRemoteStore)
 * works with a web-provided access token. The sync engine and GDrive API layer
 * use plain fetch() and should be platform-agnostic.
 */
import { SyncManager } from '@/lib/sync/manager';
import { GDriveRemoteStore } from '@/lib/sync/gdrive';

// Mock fetch for GDrive API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Minimal localStorage mock (jest-expo provides one, but ensure it exists)
if (typeof localStorage === 'undefined') {
  const store: Record<string, string> = {};
  (global as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

// Mock local store
const mockLocalStore = {
  getJournal: jest.fn(),
  saveJournal: jest.fn(),
  listJournals: jest.fn().mockResolvedValue([]),
  getPage: jest.fn(),
  savePage: jest.fn(),
  deletePage: jest.fn(),
  getAttachment: jest.fn(),
  saveAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
};

describe('Web Sync Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates SyncManager with GDriveRemoteStore without platform errors', () => {
    const store = new GDriveRemoteStore();
    const manager = new SyncManager(mockLocalStore as never, store);
    expect(manager).toBeDefined();
    expect(store).toBeDefined();
  });

  it('connects remote store with a web-provided access token', async () => {
    const store = new GDriveRemoteStore();
    const manager = new SyncManager(mockLocalStore as never, store);

    // Simulate token from web auth context
    const webToken = 'ya29.web-access-token-from-expo-auth-session';
    await manager.connectWithToken(webToken);

    // Store should be connected — verify by checking it doesn't throw
    const remoteStore = manager.getRemoteStore();
    expect(remoteStore).toBeDefined();
  });

  it('GDriveRemoteStore listRemoteJournals uses fetch with Bearer token', async () => {
    const store = new GDriveRemoteStore();
    const token = 'ya29.test-token';

    // Mock: list files returns empty (no journal registry yet)
    const body = JSON.stringify({ files: [] });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ files: [] }),
      text: async () => body,
    });

    store.connect({ accessToken: token });
    const journals = await store.listRemoteJournals();

    expect(journals).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('googleapis.com/drive/v3/files'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
        }),
      }),
    );
  });

  it('disconnects cleanly', () => {
    const store = new GDriveRemoteStore();
    const manager = new SyncManager(mockLocalStore as never, store);
    manager.connectWithToken('token');
    manager.disconnect();
    // Should not throw
    expect(manager.getState('any-journal')).toEqual(expect.objectContaining({ status: 'idle' }));
  });
});
