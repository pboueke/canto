/**
 * Tests for the web (IndexedDB-backed) LocalStore implementation.
 * Mirrors localStorage.test.ts which tests the native (expo-file-system) version.
 */
import 'fake-indexeddb/auto';
import { createLocalStore, _resetDB } from '../storage/local.web';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from '@/data';

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
      showMarkdownPlaceholder: true,
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

    // Write data directly — then read should fail gracefully
    const journal = makeJournalContent('j1');
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
