import { renderHook, act, waitFor } from '@testing-library/react-native';
import type { JournalContent, Page, Journal } from '@/data';
import { DEFAULT_JOURNAL_SETTINGS } from '@/data';

// ---------------------------------------------------------------------------
// Mock store
// ---------------------------------------------------------------------------
const mockStore = {
  initialize: jest.fn().mockResolvedValue(undefined),
  listJournals: jest.fn().mockResolvedValue([]),
  getJournal: jest.fn().mockResolvedValue(null),
  saveJournal: jest.fn().mockResolvedValue(undefined),
  deleteJournal: jest.fn().mockResolvedValue(undefined),
  getPage: jest.fn().mockResolvedValue(null),
  savePage: jest.fn().mockResolvedValue(undefined),
  deletePage: jest.fn().mockResolvedValue(undefined),
  saveAttachment: jest.fn().mockResolvedValue('attachments/a1.jpg'),
  getAttachment: jest.fn().mockResolvedValue('base64data'),
  deleteAttachment: jest.fn().mockResolvedValue(undefined),
  reencryptJournal: jest.fn().mockResolvedValue(undefined),
  reencryptAll: jest.fn().mockResolvedValue(undefined),
};

const mockEncryptionService = {
  encrypt: jest.fn((d: string) => Promise.resolve(`enc:${d}`)),
  decrypt: jest.fn((d: string) => Promise.resolve(d.replace('enc:', ''))),
  encryptWithPassword: jest.fn(),
  decryptWithPassword: jest.fn(),
  generateSalt: jest.fn(() => new Uint8Array(16)),
  clearSession: jest.fn(),
};

jest.mock('@/lib/storage', () => ({
  createLocalStore: jest.fn(() => mockStore),
}));

jest.mock('@/lib/encryption', () => ({
  createEncryptionService: jest.fn(() => mockEncryptionService),
}));

import {
  useJournals,
  useJournal,
  usePage,
  useSavePage,
  useCreateJournal,
  useCreatePage,
  useDeletePage,
  useDeleteJournal,
  useSaveJournal,
  useJournalTags,
  useAttachment,
  getEncryptionService,
  getLocalStore,
  tryLoadJournal,
} from '../useStorage';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeJournal(id = 'j1'): Journal {
  return {
    id,
    title: 'Test',
    icon: '📖',
    date: '2026-01-01T00:00:00Z',
    secure: false,
    salt: 'dGVzdHNhbHQ=',
  };
}

function makeJournalContent(id = 'j1'): JournalContent {
  return {
    ...makeJournal(id),
    pages: [],
    settings: { ...DEFAULT_JOURNAL_SETTINGS },
    version: 1,
  };
}

function makePage(id = 'p1'): Page {
  return {
    id,
    text: 'Hello',
    date: '2026-01-01T00:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getEncryptionService', () => {
  it('returns the encryption service singleton', () => {
    const svc = getEncryptionService();
    expect(svc).toBe(mockEncryptionService);
  });
});

describe('getLocalStore', () => {
  it('initializes and returns the store', async () => {
    const store = await getLocalStore();
    expect(mockStore.initialize).toHaveBeenCalled();
    expect(store).toBe(mockStore);
  });
});

describe('tryLoadJournal', () => {
  it('returns journal content', async () => {
    const jc = makeJournalContent();
    mockStore.getJournal.mockResolvedValueOnce(jc);
    const result = await tryLoadJournal('j1');
    expect(result).toBe(jc);
  });

  it('passes derived key through', async () => {
    const key = new Uint8Array([1, 2, 3]);
    await tryLoadJournal('j1', key);
    expect(mockStore.getJournal).toHaveBeenCalledWith('j1', key);
  });
});

describe('useJournals', () => {
  it('loads journals on mount', async () => {
    const journals = [makeJournal('j1'), makeJournal('j2')];
    mockStore.listJournals.mockResolvedValueOnce(journals);

    const { result } = renderHook(() => useJournals());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.journals).toEqual(journals);
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure', async () => {
    mockStore.listJournals.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useJournals());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('fail');
  });

  it('refresh reloads journals', async () => {
    mockStore.listJournals.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useJournals());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockStore.listJournals.mockResolvedValueOnce([makeJournal()]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.journals).toHaveLength(1);
  });
});

describe('useJournal', () => {
  it('loads journal by id', async () => {
    const jc = makeJournalContent();
    mockStore.getJournal.mockResolvedValueOnce(jc);

    const { result } = renderHook(() => useJournal('j1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.journal).toEqual(jc);
  });

  it('handles undefined id gracefully', async () => {
    const { result } = renderHook(() => useJournal(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.journal).toBeNull();
  });

  it('passes derivedKey to store', async () => {
    const key = new Uint8Array([1, 2, 3]);
    mockStore.getJournal.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useJournal('j1', key));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockStore.getJournal).toHaveBeenCalledWith('j1', key);
  });

  it('sets error on failure', async () => {
    mockStore.getJournal.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useJournal('j1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('nope');
  });
});

describe('usePage', () => {
  it('loads page by id', async () => {
    const page = makePage();
    mockStore.getPage.mockResolvedValueOnce(page);

    const { result } = renderHook(() => usePage('j1', 'p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toEqual(page);
  });

  it('handles missing journalId', async () => {
    const { result } = renderHook(() => usePage(undefined, 'p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBeNull();
  });

  it('handles missing pageId', async () => {
    const { result } = renderHook(() => usePage('j1', undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.page).toBeNull();
  });

  it('sets error on failure', async () => {
    mockStore.getPage.mockRejectedValueOnce(new Error('bad'));
    const { result } = renderHook(() => usePage('j1', 'p1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe('bad');
  });
});

describe('useSavePage', () => {
  it('saves a page', async () => {
    const page = makePage();
    const { result } = renderHook(() => useSavePage('j1'));

    await act(async () => {
      await result.current.save(page);
    });

    expect(mockStore.savePage).toHaveBeenCalledWith('j1', page, undefined);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does nothing without journalId', async () => {
    const { result } = renderHook(() => useSavePage(undefined));
    await act(async () => {
      await result.current.save(makePage());
    });
    expect(mockStore.savePage).not.toHaveBeenCalled();
  });

  it('sets error on failure', async () => {
    mockStore.savePage.mockRejectedValueOnce(new Error('save fail'));
    const { result } = renderHook(() => useSavePage('j1'));

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.save(makePage());
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('save fail');
    expect(result.current.error?.message).toBe('save fail');
  });
});

describe('useCreateJournal', () => {
  it('creates a journal and returns its id', async () => {
    const { result } = renderHook(() => useCreateJournal());

    let journalId: string | undefined;
    await act(async () => {
      journalId = await result.current.create({
        title: 'My Journal',
        icon: '📔',
      });
    });

    expect(journalId).toBeDefined();
    expect(mockStore.saveJournal).toHaveBeenCalled();
    const savedJournal = mockStore.saveJournal.mock.calls[0][0] as JournalContent;
    expect(savedJournal.title).toBe('My Journal');
    expect(savedJournal.secure).toBe(false);
  });

  it('creates a password-protected journal with deriveAndCache', async () => {
    const derivedKey = new Uint8Array(32);
    const deriveAndCache = jest.fn().mockResolvedValue(derivedKey);

    const { result } = renderHook(() => useCreateJournal());

    await act(async () => {
      await result.current.create(
        { title: 'Secure', icon: '🔒', password: 'test123', kdfIterations: 600000 },
        deriveAndCache,
      );
    });

    expect(deriveAndCache).toHaveBeenCalled();
    const savedJournal = mockStore.saveJournal.mock.calls[0][0] as JournalContent;
    expect(savedJournal.secure).toBe(true);
    expect(savedJournal.kdfIterations).toBe(600000);
    expect(mockStore.saveJournal.mock.calls[0][1]).toBe(derivedKey);
  });

  it('sets error on failure', async () => {
    mockStore.saveJournal.mockRejectedValueOnce(new Error('create fail'));
    const { result } = renderHook(() => useCreateJournal());

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.create({ title: 'Fail', icon: '❌' });
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('create fail');
    expect(result.current.error?.message).toBe('create fail');
  });
});

describe('useCreatePage', () => {
  it('creates a page and returns its id', async () => {
    const { result } = renderHook(() => useCreatePage('j1'));

    let pageId: string | null = null;
    await act(async () => {
      pageId = await result.current.create();
    });

    expect(pageId).toBeDefined();
    expect(mockStore.savePage).toHaveBeenCalled();
    const savedPage = mockStore.savePage.mock.calls[0][1] as Page;
    expect(savedPage.text).toBe('');
    expect(savedPage.deleted).toBe(false);
  });

  it('returns null without journalId', async () => {
    const { result } = renderHook(() => useCreatePage(undefined));

    let pageId: string | null = null;
    await act(async () => {
      pageId = await result.current.create();
    });

    expect(pageId).toBeNull();
    expect(mockStore.savePage).not.toHaveBeenCalled();
  });

  it('sets error on failure', async () => {
    mockStore.savePage.mockRejectedValueOnce(new Error('page fail'));
    const { result } = renderHook(() => useCreatePage('j1'));

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.create();
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('page fail');
    expect(result.current.error?.message).toBe('page fail');
  });
});

describe('useDeletePage', () => {
  it('soft-deletes a page', async () => {
    const { result } = renderHook(() => useDeletePage('j1'));

    await act(async () => {
      await result.current.deletePage('p1');
    });

    expect(mockStore.deletePage).toHaveBeenCalledWith('j1', 'p1', undefined);
  });

  it('does nothing without journalId', async () => {
    const { result } = renderHook(() => useDeletePage(undefined));
    await act(async () => {
      await result.current.deletePage('p1');
    });
    expect(mockStore.deletePage).not.toHaveBeenCalled();
  });

  it('sets error on failure', async () => {
    mockStore.deletePage.mockRejectedValueOnce(new Error('delete fail'));
    const { result } = renderHook(() => useDeletePage('j1'));

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.deletePage('p1');
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('delete fail');
    expect(result.current.error?.message).toBe('delete fail');
  });
});

describe('useDeleteJournal', () => {
  it('deletes a journal', async () => {
    const { result } = renderHook(() => useDeleteJournal());

    await act(async () => {
      await result.current.deleteJournal('j1');
    });

    expect(mockStore.deleteJournal).toHaveBeenCalledWith('j1');
  });

  it('sets error on failure', async () => {
    mockStore.deleteJournal.mockRejectedValueOnce(new Error('del fail'));
    const { result } = renderHook(() => useDeleteJournal());

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.deleteJournal('j1');
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('del fail');
    expect(result.current.error?.message).toBe('del fail');
  });
});

describe('useSaveJournal', () => {
  it('saves a journal', async () => {
    const jc = makeJournalContent();
    const { result } = renderHook(() => useSaveJournal());

    await act(async () => {
      await result.current.saveJournal(jc);
    });

    expect(mockStore.saveJournal).toHaveBeenCalledWith(jc, undefined);
  });

  it('passes derivedKey', async () => {
    const jc = makeJournalContent();
    const key = new Uint8Array([1, 2, 3]);
    const { result } = renderHook(() => useSaveJournal());

    await act(async () => {
      await result.current.saveJournal(jc, key);
    });

    expect(mockStore.saveJournal).toHaveBeenCalledWith(jc, key);
  });

  it('sets error on failure', async () => {
    mockStore.saveJournal.mockRejectedValueOnce(new Error('save fail'));
    const { result } = renderHook(() => useSaveJournal());

    let thrown: Error | undefined;
    await act(async () => {
      try {
        await result.current.saveJournal(makeJournalContent());
      } catch (e) {
        thrown = e as Error;
      }
    });
    expect(thrown?.message).toBe('save fail');
    expect(result.current.error?.message).toBe('save fail');
  });
});

describe('useJournalTags', () => {
  it('collects unique tags from journal pages', async () => {
    const jc = makeJournalContent();
    jc.pages = [
      { ...makePage('p1'), tags: ['Work', 'travel'] },
      { ...makePage('p2'), tags: ['WORK', 'personal'] },
    ];
    mockStore.getJournal.mockResolvedValueOnce(jc);

    const { result } = renderHook(() => useJournalTags('j1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tags).toEqual(['personal', 'travel', 'work']);
  });

  it('excludes deleted pages', async () => {
    const jc = makeJournalContent();
    jc.pages = [
      { ...makePage('p1'), tags: ['active'] },
      { ...makePage('p2'), tags: ['deleted-tag'], deleted: true },
    ];
    mockStore.getJournal.mockResolvedValueOnce(jc);

    const { result } = renderHook(() => useJournalTags('j1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tags).toEqual(['active']);
  });

  it('returns empty for undefined journalId', async () => {
    const { result } = renderHook(() => useJournalTags(undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tags).toEqual([]);
  });

  it('returns empty on error', async () => {
    mockStore.getJournal.mockRejectedValueOnce(new Error('oops'));
    const { result } = renderHook(() => useJournalTags('j1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tags).toEqual([]);
  });
});

describe('useAttachment', () => {
  it('saves an attachment', async () => {
    const attachment = {
      id: 'a1',
      path: '',
      name: 'photo.jpg',
      type: 'image' as const,
      encrypted: false,
      deleted: false,
    };
    const { result } = renderHook(() => useAttachment());

    let path: string | undefined;
    await act(async () => {
      path = await result.current.saveAttachment('j1', 'p1', attachment, 'base64data');
    });

    expect(path).toBe('attachments/a1.jpg');
    expect(mockStore.saveAttachment).toHaveBeenCalledWith(
      'j1',
      'p1',
      attachment,
      'base64data',
      undefined,
    );
  });

  it('passes derivedKey for encrypted attachments', async () => {
    const key = new Uint8Array([1, 2]);
    const attachment = {
      id: 'a1',
      path: '',
      name: 'photo.jpg',
      type: 'image' as const,
      encrypted: true,
      deleted: false,
    };
    const { result } = renderHook(() => useAttachment(key));

    await act(async () => {
      await result.current.saveAttachment('j1', 'p1', attachment, 'base64data');
    });

    expect(mockStore.saveAttachment).toHaveBeenCalledWith(
      'j1',
      'p1',
      attachment,
      'base64data',
      key,
    );
  });

  it('gets an attachment', async () => {
    const { result } = renderHook(() => useAttachment());

    let data: string | null = null;
    await act(async () => {
      data = await result.current.getAttachment('path/to/file', false);
    });

    expect(data).toBe('base64data');
    expect(mockStore.getAttachment).toHaveBeenCalledWith('path/to/file', undefined);
  });

  it('deletes an attachment', async () => {
    const { result } = renderHook(() => useAttachment());

    await act(async () => {
      await result.current.deleteAttachment('path/to/file');
    });

    expect(mockStore.deleteAttachment).toHaveBeenCalledWith('path/to/file');
  });
});

describe('useJournalTags – null journal', () => {
  it('returns empty tags when journal is null', async () => {
    mockStore.getJournal.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useJournalTags('j-null'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tags).toEqual([]);
  });
});

describe('ensureInitialized concurrency', () => {
  it('concurrent getLocalStore calls return the same store instance', async () => {
    const results = await Promise.all([getLocalStore(), getLocalStore(), getLocalStore()]);

    // All should return the same store reference
    for (const result of results) {
      expect(result).toBe(results[0]);
    }
  });
});

describe('ensureInitialized error recovery', () => {
  beforeEach(() => {
    // Reset module-level singletons so initPromise is null
    jest.resetModules();
    jest.doMock('@/lib/storage', () => ({
      createLocalStore: jest.fn(() => ({
        ...mockStore,
        initialize: jest
          .fn()
          .mockRejectedValueOnce(new Error('init fail'))
          .mockResolvedValue(undefined),
      })),
    }));
    jest.doMock('@/lib/encryption', () => ({
      createEncryptionService: jest.fn(() => mockEncryptionService),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resets initPromise on initialize failure and retries', async () => {
    const { getLocalStore: getLS } = require('../useStorage');

    // First call should fail (initialize rejects)
    await expect(getLS()).rejects.toThrow('init fail');

    // After failure, initPromise is reset — next call should succeed
    const store = await getLS();
    expect(store.initialize).toHaveBeenCalledTimes(2);
  });
});
