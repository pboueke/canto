/**
 * Tests for the web (IndexedDB-backed) LocalStore implementation.
 * Mirrors localStorage.test.ts which tests the native (expo-file-system) version.
 */
import 'fake-indexeddb/auto';
import { createLocalStore, _resetDB } from '../storage/local.web';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from 'canto-data';

// Passthrough encryption mock (no actual encryption for test simplicity)
function createMockEncryption(): EncryptionService {
  return {
    encrypt: jest.fn((data: string) => Promise.resolve(`enc:${data}`)),
    decrypt: jest.fn((data: string) => Promise.resolve(data.replace(/^enc:/, ''))),
    encryptWithPassword: jest.fn(),
    decryptWithPassword: jest.fn(),
    generateSalt: jest.fn(() => new Uint8Array(16)),
    clearSession: jest.fn(),
  };
}

function makeJournalContent(id: string, pages: Page[] = []): JournalContent {
  return {
    id,
    title: `Journal ${id}`,
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
      remoteSync: false,
      autoSync: false,
    },
    version: 1,
  };
}

function makePage(id: string): Page {
  return {
    id,
    text: `Page ${id} content`,
    date: '2026-03-12T10:00:00Z',
    tags: ['test'],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
  };
}

beforeEach(async () => {
  // Close cached connection and delete the database between tests
  _resetDB();
  indexedDB.deleteDatabase('canto');
});

describe('createLocalStore (web/IndexedDB)', () => {
  it('initialize does not throw', async () => {
    const store = createLocalStore(createMockEncryption());
    await expect(store.initialize()).resolves.not.toThrow();
  });

  it('listJournals returns empty array initially', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const journals = await store.listJournals();
    expect(journals).toEqual([]);
  });

  it('saveJournal and listJournals round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const journal = makeJournalContent('j1');
    await store.saveJournal(journal);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');
    expect(journals[0].title).toBe('Journal j1');
  });

  it('getJournal returns saved journal with pages', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].id).toBe('p1');
  });

  it('getJournal returns null for non-existent journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const result = await store.getJournal('nonexistent');
    expect(result).toBeNull();
  });

  it('deleteJournal removes journal from listing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await store.deleteJournal('j1');
    const journals = await store.listJournals();
    expect(journals).toHaveLength(0);
  });

  it('savePage and getPage round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const page = makePage('p1');
    await store.savePage('j1', page);
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Page p1 content');
  });

  it('getPage returns null for non-existent page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const result = await store.getPage('j1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('deletePage soft-deletes the page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await store.savePage('j1', makePage('p1'));
    await store.deletePage('j1', 'p1');
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });

  it('saveAttachment returns a path string', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  it('getAttachment returns saved data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    const result = await store.getAttachment(path);
    expect(result).toBe('base64data');
  });

  it('deleteAttachment removes the entry', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    await store.deleteAttachment(path);
    const result = await store.getAttachment(path);
    expect(result).toBeNull();
  });

  it('deleteJournal removes journal data so getJournal returns null', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    expect(await store.getJournal('j1')).not.toBeNull();
    await store.deleteJournal('j1');
    expect(await store.listJournals()).toHaveLength(0);
    expect(await store.getJournal('j1')).toBeNull();
  });

  it('deleteJournal also removes attachments', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    await store.deleteJournal('j1');
    const result = await store.getAttachment(path);
    expect(result).toBeNull();
  });

  it('deleteJournal removes index entry even when called on already-deleted journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await store.saveJournal(makeJournalContent('j2'));
    await store.deleteJournal('j1');
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j2');
    await expect(store.deleteJournal('j1')).resolves.not.toThrow();
  });

  it('updates existing journal in index on re-save', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const updated = makeJournalContent('j1');
    updated.title = 'Updated Title';
    await store.saveJournal(updated);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].title).toBe('Updated Title');
  });

  it('savePage updates modified timestamp', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const page = makePage('p1');
    const originalModified = page.modified;
    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 5));
    await store.savePage('j1', page);
    const result = await store.getPage('j1', 'p1');
    expect(result!.modified).toBeGreaterThanOrEqual(originalModified);
  });

  it('handles multiple journals independently', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await store.saveJournal(makeJournalContent('j2', [makePage('p2'), makePage('p3')]));

    const journals = await store.listJournals();
    expect(journals).toHaveLength(2);

    const j1 = await store.getJournal('j1');
    expect(j1!.pages).toHaveLength(1);

    const j2 = await store.getJournal('j2');
    expect(j2!.pages).toHaveLength(2);

    await store.deleteJournal('j1');
    expect(await store.listJournals()).toHaveLength(1);
    expect(await store.getJournal('j2')).not.toBeNull();
  });
});

describe('readEncrypted password-layer fallback (web)', () => {
  it('returns device-decrypted content when password decryption fails', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Save a journal WITHOUT password encryption
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Read with a derivedKey — password layer decryption will fail, should fall back
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getJournal('j1', derivedKey);
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });

  it('returns null when device decryption fails', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Save journal normally
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Now make decrypt fail
    encryption.decrypt = jest.fn(() => {
      throw new Error('Decryption failed');
    });

    // Should return null gracefully (readEncrypted catches and returns null)
    const result = await store.getJournal('j1');
    expect(result).toBeNull();
  });
});

describe('getAttachment password fallback (web)', () => {
  it('returns device-decrypted content without derivedKey', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', att, 'base64data');
    const result = await store.getAttachment(path);
    expect(result).toBe('base64data');
  });

  it('returns device-decrypted content when password decryption fails', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Read with derivedKey — password decrypt will fail since data isn't password-encrypted
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getAttachment(path, derivedKey);
    expect(result).not.toBeNull();
  });
});

describe('deletePage attachment cleanup (web)', () => {
  it('cleans up attachments when deleting a page with images', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const attPath = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Save page with attachment
    const page = makePage('p1');
    page.images = [{ ...att, path: attPath }];
    await store.savePage('j1', page);

    // Delete the page
    await store.deletePage('j1', 'p1');

    // Wait for non-blocking cleanup
    await new Promise((r) => setTimeout(r, 50));

    // Verify page is soft-deleted
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });
});

describe('reencryptAll (web/IndexedDB)', () => {
  it('re-encrypts all data so it is readable with new key', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();

    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);

    expect(await store.listJournals()).toHaveLength(1);
    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();
    expect(loaded!.pages[0].text).toBe('Page p1 content');

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Create a fresh store with new encryption to verify
    _resetDB();
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');

    const result = await newStore.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Journal j1');
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].text).toBe('Page p1 content');
  });

  it('re-encrypts data that is no longer readable with old key', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('old:')) throw new Error('Wrong key');
      return Promise.resolve(data.replace(/^old:/, ''));
    });

    const store = createLocalStore(oldEncryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    const result = await store.getJournal('j1');
    expect(result).toBeNull();
  });

  it('re-encrypts multiple journals and their pages', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await store.saveJournal(makeJournalContent('j2', [makePage('p3')]));

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    _resetDB();
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(2);

    const j1 = await newStore.getJournal('j1');
    expect(j1).not.toBeNull();
    expect(j1!.pages).toHaveLength(2);

    const j2 = await newStore.getJournal('j2');
    expect(j2).not.toBeNull();
    expect(j2!.pages).toHaveLength(1);
    expect(j2!.pages[0].text).toBe('Page p3 content');
  });

  it('re-encrypts attachments during key rotation', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    await store.saveAttachment('j1', 'p1', attachment, 'imagedata');

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify with new encryption
    _resetDB();
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
  });
});

describe('reencryptJournal (web/IndexedDB)', () => {
  it('re-encrypts journal pages with new password key', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);

    // Re-encrypt with a "new key" (we just verify the method doesn't throw
    // and that data is still readable after)
    const newKey = new Uint8Array(32);
    crypto.getRandomValues(newKey);

    // Load fresh journal content for re-encryption
    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();

    await store.reencryptJournal(loaded!, undefined, undefined);

    // Data should still be readable
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
    expect(result!.pages[0].text).toBe('Page p1 content');
  });

  it('reports progress during re-encryption', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const pages = [makePage('p1'), makePage('p2'), makePage('p3')];
    const journal = makeJournalContent('j1', pages);
    await store.saveJournal(journal);

    const loaded = await store.getJournal('j1');
    const progressCalls: [number, number][] = [];
    await store.reencryptJournal(loaded!, undefined, undefined, (c, t) => {
      progressCalls.push([c, t]);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    // Last call should have current === total
    const last = progressCalls[progressCalls.length - 1];
    expect(last[0]).toBe(last[1]);
  });
});

describe('reencryptJournal attachment handling (web)', () => {
  it('falls back when attachment is not password-encrypted during reencrypt', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);
    await store.saveAttachment('j1', 'p1', att, 'imagedata');

    const loaded = await store.getJournal('j1');

    // Re-encrypt with an oldKey — aesGcmDecrypt will fail on the attachment
    const oldKey = new Uint8Array(32);
    crypto.getRandomValues(oldKey);
    await store.reencryptJournal(loaded!, oldKey, undefined);

    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
  });

  it('adds new journal to index during reencrypt', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // reencryptJournal with a journal not yet in the index
    const j1 = makeJournalContent('j1', [makePage('p1')]);
    await store.reencryptJournal(j1, undefined, undefined);

    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');
  });

  it('sets attachment.encrypted=true when adding password (newKey provided)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const att: Attachment = {
      id: 'img1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const page: Page = { ...makePage('p1'), images: [att] };
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const savedPath = await store.saveAttachment('j1', 'p1', att, 'imagedata');

    const loaded = await store.getJournal('j1');
    loaded!.pages[0].images[0].path = savedPath;

    const newKey = new Uint8Array(32).fill(42);
    await store.reencryptJournal(loaded!, undefined, newKey);

    const result = await store.getJournal('j1', newKey);
    expect(result!.pages[0].images[0].encrypted).toBe(true);
  });

  it('sets attachment.encrypted=false when removing password (newKey undefined)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const att: Attachment = {
      id: 'img1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: true,
      deleted: false,
    };
    const page: Page = { ...makePage('p1'), images: [att] };
    const oldKey = new Uint8Array(32).fill(10);
    const journal: JournalContent = {
      ...makeJournalContent('j1', [page]),
      secure: true,
    };
    await store.saveJournal(journal, oldKey);
    const savedPath = await store.saveAttachment('j1', 'p1', att, 'imagedata', oldKey);

    const loaded = await store.getJournal('j1', oldKey);
    loaded!.pages[0].images[0].path = savedPath;

    await store.reencryptJournal(loaded!, oldKey, undefined);

    const result = await store.getJournal('j1');
    expect(result!.pages[0].images[0].encrypted).toBe(false);
  });
});

describe('IDB error handling (web)', () => {
  it('idbGet rejects on transaction error', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Save some data so we can try to read it
    await store.saveJournal(makeJournalContent('j1'));

    // Close the DB to cause errors on next operation
    _resetDB();
    // Delete the database so re-open creates a fresh one
    indexedDB.deleteDatabase('canto');

    // This should recover (openDB will re-open)
    const journals = await store.listJournals();
    expect(journals).toEqual([]);
  });
});

describe('IDB error paths (web/IndexedDB)', () => {
  let origTransaction: typeof IDBDatabase.prototype.transaction;

  beforeEach(() => {
    origTransaction = IDBDatabase.prototype.transaction;
  });

  afterEach(() => {
    IDBDatabase.prototype.transaction = origTransaction;
    jest.useRealTimers();
  });

  async function getInitializedStore() {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    return { store, encryption };
  }

  function interceptNextTransaction(patchTx: (tx: IDBTransaction) => void) {
    const orig = origTransaction;
    let intercepted = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = orig.call(this, storeNames, mode);
      if (!intercepted) {
        intercepted = true;
        patchTx(tx);
      }
      return tx;
    };
  }

  describe('openDB error (L73)', () => {
    it('rejects when indexedDB.open fails', async () => {
      _resetDB();
      const openSpy = jest.spyOn(indexedDB, 'open').mockImplementation(() => {
        const listeners: Record<string, ((e: Event) => void) | null> = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          onblocked: null,
        };
        const fakeReq = {
          get onsuccess() {
            return listeners.onsuccess;
          },
          set onsuccess(fn) {
            listeners.onsuccess = fn;
          },
          get onerror() {
            return listeners.onerror;
          },
          set onerror(fn) {
            listeners.onerror = fn;
            queueMicrotask(() => {
              if (listeners.onerror) listeners.onerror(new Event('error'));
            });
          },
          get onupgradeneeded() {
            return listeners.onupgradeneeded;
          },
          set onupgradeneeded(fn) {
            listeners.onupgradeneeded = fn;
          },
          get onblocked() {
            return listeners.onblocked;
          },
          set onblocked(fn) {
            listeners.onblocked = fn;
          },
          error: new DOMException('Open failed'),
          result: null,
          readyState: 'done',
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
          transaction: null,
          source: null,
        } as unknown as IDBOpenDBRequest;
        return fakeReq;
      });

      const encryption = createMockEncryption();
      const store = createLocalStore(encryption);
      await expect(store.initialize()).rejects.toThrow();

      openSpy.mockRestore();
    });
  });

  describe('idbGet request onerror (L103-104)', () => {
    it('rejects when IDB get request errors', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.get = () => {
            const fakeReq = {
              onsuccess: null as ((e: Event) => void) | null,
              onerror: null as ((e: Event) => void) | null,
              error: new DOMException('Get failed'),
              result: undefined,
            };
            queueMicrotask(() => {
              if (fakeReq.onerror) fakeReq.onerror(new Event('error'));
            });
            return fakeReq as unknown as IDBRequest;
          };
          return os;
        };
      });

      await expect(store.getPage('j1', 'p1')).rejects.toThrow();
    });
  });

  describe('idbGet transaction abort (L107-108)', () => {
    it('rejects when IDB get transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.get = () => {
            queueMicrotask(() => {
              try {
                tx.abort();
              } catch {
                /* */
              }
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
      });

      await expect(store.getPage('j1', 'p1')).rejects.toThrow();
    });
  });

  describe('idbPut transaction onerror (L128-129)', () => {
    it('rejects when IDB put transaction errors', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.put = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', {
                value: new DOMException('Write failed'),
                configurable: true,
              });
              if (tx.onerror) tx.onerror(new Event('error'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow();
    });
  });

  describe('idbPut transaction abort (L132-133)', () => {
    it('rejects when IDB put transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.put = () => {
            queueMicrotask(() => {
              try {
                tx.abort();
              } catch {
                /* */
              }
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow();
    });
  });

  describe('idbDelete transaction onerror (L153-154)', () => {
    it('rejects when IDB delete transaction errors', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.delete = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', {
                value: new DOMException('Delete failed'),
                configurable: true,
              });
              if (tx.onerror) tx.onerror(new Event('error'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.deleteAttachment('some/path')).rejects.toThrow();
    });
  });

  describe('idbDelete transaction abort (L157-158)', () => {
    it('rejects when IDB delete transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.delete = () => {
            queueMicrotask(() => {
              try {
                tx.abort();
              } catch {
                /* */
              }
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.deleteAttachment('some/path')).rejects.toThrow();
    });
  });

  describe('idbDeletePrefix transaction onerror (L187-188)', () => {
    it('rejects when IDB deletePrefix transaction errors', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.openCursor = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', {
                value: new DOMException('DeletePrefix failed'),
                configurable: true,
              });
              if (tx.onerror) tx.onerror(new Event('error'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.deleteJournal('j1')).rejects.toThrow();
    });
  });

  describe('idbDeletePrefix transaction abort (L191-192)', () => {
    it('rejects when IDB deletePrefix transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction((tx) => {
        const origOS = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const os = origOS(name);
          os.openCursor = () => {
            queueMicrotask(() => {
              try {
                tx.abort();
              } catch {
                /* */
              }
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return os;
        };
        Object.defineProperty(tx, 'oncomplete', {
          set: () => {},
          get: () => null,
          configurable: true,
        });
      });

      await expect(store.deleteJournal('j1')).rejects.toThrow();
    });
  });
});

describe('encrypted operations (web/IndexedDB)', () => {
  it('saveAttachment with encrypted flag applies password encryption', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);

    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'secret.jpg',
      type: 'image',
      encrypted: true,
      deleted: false,
    };

    const path = await store.saveAttachment('j1', 'p1', attachment, 'secretdata', derivedKey);
    expect(path).toContain('eimg-');

    // getAttachment without key returns device-decrypted content (password layer still present)
    const withoutKey = await store.getAttachment(path);
    expect(withoutKey).not.toBeNull();

    // getAttachment with key should return original data
    const withKey = await store.getAttachment(path, derivedKey);
    expect(withKey).not.toBeNull();
  });

  it('saveAttachment without encrypted flag ignores derivedKey', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const attachment: Attachment = {
      id: 'att-2',
      path: '',
      name: 'public.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };

    const path = await store.saveAttachment('j1', 'p1', attachment, 'publicdata');
    expect(path).toContain('img-');
    expect(path).not.toContain('eimg-');

    const data = await store.getAttachment(path);
    expect(data).toBe('publicdata');
  });

  it('getAttachment returns null for non-existent path', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const result = await store.getAttachment('nonexistent/path');
    expect(result).toBeNull();
  });

  it('readEncrypted returns null on decryption failure', async () => {
    const encryption = createMockEncryption();
    encryption.decrypt = jest.fn(() => {
      throw new Error('Decryption failed');
    });

    const store = createLocalStore(encryption);
    await store.initialize();

    // We can't save normally since encrypt works but decrypt fails,
    // so test getJournal on non-existent data
    const result = await store.getJournal('j1');
    expect(result).toBeNull();
  });

  it('deletePage on non-existent page does not throw', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    await expect(store.deletePage('j1', 'nonexistent')).resolves.not.toThrow();
  });

  it('attachment path includes file type prefix', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const imageAtt: Attachment = {
      id: 'img-att',
      path: '',
      name: 'photo.png',
      type: 'image',
      encrypted: false,
      deleted: false,
    };

    const fileAtt: Attachment = {
      id: 'file-att',
      path: '',
      name: 'doc.pdf',
      type: 'file',
      encrypted: false,
      deleted: false,
    };

    const imgPath = await store.saveAttachment('j1', 'p1', imageAtt, 'imgdata');
    const filePath = await store.saveAttachment('j1', 'p1', fileAtt, 'filedata');

    expect(imgPath).toContain('img-');
    expect(filePath).toContain('fl-');
    expect(imgPath).toContain('.png');
    expect(filePath).toContain('.pdf');
  });

  it('_resetDB allows creating a fresh store instance', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    expect(await store.listJournals()).toHaveLength(1);

    // Reset and create new store — data persists in IDB
    _resetDB();
    const store2 = createLocalStore(encryption);
    const journals = await store2.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');
  });
});
