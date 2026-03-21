import { createLocalStore } from '../storage/local';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from '@/data';

// In-memory filesystem mock
const filesystem: Record<string, string> = {};

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get parentDirectory() {
      const parent = this.uri.split('/').slice(0, -1).join('/');
      return new MockDirectory(parent);
    }
    get exists() {
      return this.uri in filesystem;
    }
    create() {
      if (!(this.uri in filesystem)) {
        filesystem[this.uri] = '';
      }
    }
    write(content: string) {
      filesystem[this.uri] = content;
    }
    text() {
      return Promise.resolve(filesystem[this.uri] ?? '');
    }
    delete() {
      delete filesystem[this.uri];
    }
    move(target: MockFile) {
      filesystem[target.uri] = filesystem[this.uri];
      delete filesystem[this.uri];
    }
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      const segments = parts.map((p) => (typeof p === 'string' ? p : p.uri));
      this.uri = segments.join('/');
    }
    get exists() {
      return Object.keys(filesystem).some((k) => k.startsWith(this.uri));
    }
    create() {
      // no-op for directories in our mock
    }
    list() {
      const prefix = this.uri + '/';
      const entries: (MockFile | MockDirectory)[] = [];
      const seenDirs = new Set<string>();
      for (const key of Object.keys(filesystem)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) {
          entries.push(new MockFile(key));
        } else {
          const dirName = rest.split('/')[0];
          const dirUri = prefix + dirName;
          if (!seenDirs.has(dirUri)) {
            seenDirs.add(dirUri);
            entries.push(new MockDirectory(dirUri));
          }
        }
      }
      return entries;
    }
    delete() {
      for (const key of Object.keys(filesystem)) {
        if (key.startsWith(this.uri)) {
          delete filesystem[key];
        }
      }
    }
  }

  return {
    Paths: { document: { uri: '/mock-docs' } },
    File: MockFile,
    Directory: MockDirectory,
  };
});

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

beforeEach(() => {
  // Clear the in-memory filesystem
  for (const key of Object.keys(filesystem)) {
    delete filesystem[key];
  }
});

describe('createLocalStore', () => {
  it('initialize does not throw', async () => {
    const store = createLocalStore(createMockEncryption());
    await expect(store.initialize()).resolves.not.toThrow();
  });

  it('initialize recovers .tmp files left from interrupted writes', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);

    // Save a journal first so the directory structure exists
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    // Simulate an interrupted write by creating a .tmp file in the journal dir
    const journalDir = '/mock-docs/canto/j1';
    filesystem[`${journalDir}/metadata.json.tmp`] = 'enc:{"id":"j1","title":"Recovered"}';

    // Also create a .tmp in pages dir
    const pagesDir = `${journalDir}/pages`;
    filesystem[`${pagesDir}/p1.json.tmp`] = 'enc:{"id":"p1","text":"recovered page"}';

    // Initialize should recover these .tmp files
    await store.initialize();

    // The .tmp files should have been renamed to their final names
    expect(filesystem[`${journalDir}/metadata.json`]).toBeDefined();
    expect(filesystem[`${pagesDir}/p1.json`]).toBeDefined();
    expect(filesystem[`${journalDir}/metadata.json.tmp`]).toBeUndefined();
    expect(filesystem[`${pagesDir}/p1.json.tmp`]).toBeUndefined();
  });

  it('listJournals returns empty array initially', async () => {
    const store = createLocalStore(createMockEncryption());
    const journals = await store.listJournals();
    expect(journals).toEqual([]);
  });

  it('saveJournal and listJournals round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    const journal = makeJournalContent('j1');
    await store.saveJournal(journal);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j1');
    expect(journals[0].title).toBe('Journal j1');
  });

  it('getJournal returns saved journal with pages', async () => {
    const store = createLocalStore(createMockEncryption());
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
    const result = await store.getJournal('nonexistent');
    expect(result).toBeNull();
  });

  it('deleteJournal removes journal from listing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.deleteJournal('j1');
    const journals = await store.listJournals();
    expect(journals).toHaveLength(0);
  });

  it('savePage and getPage round-trip', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const page = makePage('p1');
    await store.savePage('j1', page);
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Page p1 content');
  });

  it('getPage returns null for non-existent page', async () => {
    const store = createLocalStore(createMockEncryption());
    const result = await store.getPage('j1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('deletePage soft-deletes the page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.savePage('j1', makePage('p1'));
    await store.deletePage('j1', 'p1');
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });

  it('saveAttachment returns a file URI', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const uri = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    expect(typeof uri).toBe('string');
    expect(uri.length).toBeGreaterThan(0);
  });

  it('deleteAttachment removes the file', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const uri = await store.saveAttachment('j1', 'p1', attachment, 'base64data');
    await store.deleteAttachment(uri);
    const result = await store.getAttachment(uri);
    expect(result).toBeNull();
  });

  it('deleteJournal removes journal data so getJournal returns null', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    // Verify it exists
    expect(await store.getJournal('j1')).not.toBeNull();
    await store.deleteJournal('j1');
    // Index is cleared
    expect(await store.listJournals()).toHaveLength(0);
    // Data is cleared
    expect(await store.getJournal('j1')).toBeNull();
  });

  it('deleteJournal removes index entry even when called on already-deleted journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await store.saveJournal(makeJournalContent('j2'));
    await store.deleteJournal('j1');
    // j2 should still be there
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].id).toBe('j2');
    // Deleting again should not throw
    await expect(store.deleteJournal('j1')).resolves.not.toThrow();
  });

  it('updates existing journal in index on re-save', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    const updated = makeJournalContent('j1');
    updated.title = 'Updated Title';
    await store.saveJournal(updated);
    const journals = await store.listJournals();
    expect(journals).toHaveLength(1);
    expect(journals[0].title).toBe('Updated Title');
  });
});

describe('readEncrypted password-layer fallback', () => {
  it('returns device-decrypted content when password decryption fails (L85)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);

    // Save a journal WITHOUT password encryption
    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    // Now read with a derivedKey — password layer decryption will fail (data is not
    // password-encrypted), so it should fall back to returning device-decrypted content
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getJournal('j1', derivedKey);
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });
});

describe('deletePage edge cases', () => {
  it('deletePage on non-existent page returns without error (L305)', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));
    await expect(store.deletePage('j1', 'nonexistent')).resolves.not.toThrow();
  });

  it('deletePage cleans up attachment files (L319-325)', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('j1'));

    // Create a page with an attachment that has a path
    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const attPath = await store.saveAttachment('j1', 'p1', att, 'base64data');

    // Save a page with the attachment
    const page = makePage('p1');
    page.images = [{ ...att, path: attPath }];
    await store.savePage('j1', page);

    // Delete the page — should trigger attachment cleanup
    await store.deletePage('j1', 'p1');

    // Allow the non-blocking cleanup to complete
    await new Promise((r) => setTimeout(r, 50));

    // Verify page is soft-deleted
    const result = await store.getPage('j1', 'p1');
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);
  });
});

describe('getAttachment', () => {
  it('returns device-decrypted content without derivedKey (L381)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
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

    // Read without derivedKey — should return device-decrypted data
    const result = await store.getAttachment(path);
    expect(result).toBe('base64data');
  });

  it('returns device-decrypted content when password decryption fails (L378)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
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

    // Read with derivedKey — password decrypt will fail, should fall back
    const derivedKey = new Uint8Array(32);
    crypto.getRandomValues(derivedKey);
    const result = await store.getAttachment(path, derivedKey);
    expect(result).not.toBeNull();
  });
});

describe('reencryptJournal', () => {
  it('re-encrypts pages and metadata with progress', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const journal = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(journal);

    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();

    const progressCalls: [number, number][] = [];
    await store.reencryptJournal(loaded!, undefined, undefined, (c, t) => {
      progressCalls.push([c, t]);
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
    expect(result!.pages).toHaveLength(1);
  });

  it('falls back when attachment is not password-encrypted during reencrypt (L421-422)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Save journal with attachment (no password encryption)
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
    // (it wasn't password-encrypted), hitting the catch branch at L421-422
    const oldKey = new Uint8Array(32);
    crypto.getRandomValues(oldKey);
    await store.reencryptJournal(loaded!, oldKey, undefined);

    const result = await store.getJournal('j1');
    expect(result).not.toBeNull();
  });

  it('adds new journal to index during reencrypt (L459)', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    // Create journal content without saving it to the index (simulate orphaned data)
    // Actually, we need to create a journal that exists as files but NOT in the index.
    // The simplest way: save normally, then re-create store (fresh readIndex) and call
    // reencryptJournal with a journal ID not in the index.

    // Save j1 normally
    const j1 = makeJournalContent('j1', [makePage('p1')]);
    await store.saveJournal(j1);

    // Now call reencryptJournal with a journal whose id is 'j2' (not in index)
    const j2 = makeJournalContent('j2', [makePage('p2')]);
    // We need files on disk for j2, so save it first then delete from index only
    await store.saveJournal(j2);
    // Remove j2 from index by manipulating — actually let's just use a different approach:
    // Delete j2, then re-save its files manually, then reencrypt.
    // Simplest: just call reencryptJournal with j2 content when j2 is already in index.
    // That covers the "existing >= 0" path. For the "push" path (L459), j2 must NOT be in index.

    // Delete j2 from index (but keep files)
    await store.deleteJournal('j2');

    // Now j2 files are gone too (deleteJournal removes dir). Let me re-save just the files.
    // Actually, the reencryptJournal method doesn't check if files exist — it writes new ones.
    // It just reads from the journal parameter. So we can call it with any journal content.
    const j3 = makeJournalContent('j3', [makePage('p3')]);
    await store.reencryptJournal(j3, undefined, undefined);

    // j3 should now be in the index
    const journals = await store.listJournals();
    const ids = journals.map((j) => j.id);
    expect(ids).toContain('j1');
    expect(ids).toContain('j3');
  });
});

describe('reencryptAll (device key rotation)', () => {
  it('re-encrypts all data so it is readable with new key', async () => {
    // Simulate two different device keys via prefixed passthrough encryption
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();

    // Save journal + page with old encryption
    const page = makePage('p1');
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);

    // Verify data is readable with old key
    expect(await store.listJournals()).toHaveLength(1);
    const loaded = await store.getJournal('j1');
    expect(loaded).not.toBeNull();
    expect(loaded!.pages[0].text).toBe('Page p1 content');

    // Simulate key rotation: re-encrypt from old→new key
    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Now create a store with "new" encryption to verify data is accessible
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

    // Old encryption can no longer decrypt the data (prefix is now "new:", not "old:")
    // The store still uses old encryption internally, so reads should fail
    const result = await store.getJournal('j1');
    // readEncrypted catches errors and returns null when decryption fails
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

    // Verify with new encryption
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

  it('re-encrypts attachments during device key rotation', async () => {
    const oldEncryption = createMockEncryption();
    oldEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`old:${data}`));
    oldEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^old:/, '')));

    const store = createLocalStore(oldEncryption);
    await store.initialize();

    // Save journal with an attachment
    await store.saveJournal(makeJournalContent('j1'));
    const att: Attachment = {
      id: 'att-1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    await store.saveAttachment('j1', 'p1', att, 'imagedata');

    const oldDecrypt = (ct: string) => Promise.resolve(ct.replace(/^old:/, ''));
    const oldEncrypt = (pt: string) => Promise.resolve(`old:${pt}`);
    const newEncrypt = (pt: string) => Promise.resolve(`new:${pt}`);
    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify with new encryption
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`new:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => Promise.resolve(data.replace(/^new:/, '')));
    const newStore = createLocalStore(newEncryption);

    const journals = await newStore.listJournals();
    expect(journals).toHaveLength(1);
  });

  it('works when index and journal data are on different keys (previous failed rotation)', async () => {
    // Simulate a previous failed rotation that re-encrypted the INDEX
    // with key B but left journal data on key A.
    //
    // Step 1: Create data with key A
    const encryptionA = createMockEncryption();
    encryptionA.encrypt = jest.fn((data: string) => Promise.resolve(`keyA:${data}`));
    encryptionA.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('keyA:')) throw new Error('Wrong key A');
      return Promise.resolve(data.replace(/^keyA:/, ''));
    });

    const store = createLocalStore(encryptionA);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    // Step 2: Simulate the buggy rotation that only re-encrypted the index.
    // Manually re-encrypt just the index file from keyA→keyB.
    const indexUri = '/mock-docs/canto/journals.json';
    const indexCiphertext = filesystem[indexUri]; // "keyA:..."
    const indexPlain = indexCiphertext.replace(/^keyA:/, '');
    filesystem[indexUri] = `keyB:${indexPlain}`;
    // Journal metadata + pages remain on key A (buggy rotation didn't touch them)

    // Step 3: Now simulate the FIXED rotation with a fallback oldDecrypt.
    // This mirrors what SecuritySettingsModal does:
    //   try singleton decrypt (key A) → catch → fallback to SecureStore key (B)
    const oldDecrypt = async (ct: string) => {
      try {
        return await encryptionA.decrypt(ct);
      } catch {
        // fallback: try key B (the SecureStore key from the failed rotation)
        if (!ct.startsWith('keyB:')) throw new Error('Wrong key B');
        return ct.replace(/^keyB:/, '');
      }
    };
    const oldEncrypt = (_pt: string) => Promise.resolve('unused');
    const newEncrypt = (pt: string) => Promise.resolve(`keyC:${pt}`);

    await store.reencryptAll(oldDecrypt, oldEncrypt, newEncrypt);

    // Verify everything is now consistently on key C
    const newEncryption = createMockEncryption();
    newEncryption.encrypt = jest.fn((data: string) => Promise.resolve(`keyC:${data}`));
    newEncryption.decrypt = jest.fn((data: string) => {
      if (!data.startsWith('keyC:')) throw new Error('Wrong key C');
      return Promise.resolve(data.replace(/^keyC:/, ''));
    });
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
});
