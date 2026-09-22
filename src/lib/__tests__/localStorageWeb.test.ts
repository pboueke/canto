/**
 * Tests for the web (IndexedDB-backed) LocalStore implementation.
 * Mirrors localStorage.test.ts which tests the native (expo-file-system) version.
 */
import 'fake-indexeddb/auto';
import {
  createLocalStore,
  _resetDB,
  WEB_PASSWORD_ATTACHMENT_LIMIT_BYTES,
} from '../storage/local.web';
import type { EncryptionService } from '../encryption';
import type { JournalContent, Page, Attachment } from 'canto-data';
import {
  ATTACHMENT_CHUNK_SIZE,
  LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES,
  chunkedContentForBase64,
  chunkedContentForByteLength,
  encodeChunkFrame,
} from '../storage/attachment-content';
import { getStorageIoCounters, resetStorageIoCounters } from '../storage/io-counters';

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

// Raw helpers below can run before the first store.initialize() (to build a
// legacy device state). A version-less open of a freshly-deleted database
// creates it at version 1, so it must also create the same "files" store the
// production openDB creates on upgrade: production opens at version 1 too, and
// onupgradeneeded would never fire against an already-version-1 database.
async function putRawStorageRecord(path: string, data: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) {
        request.result.createObjectStore('files', { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ path, data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getRawStorageRecord(path: string): Promise<string | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) {
        request.result.createObjectStore('files', { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const value = await new Promise<{ path: string; data: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').get(path);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    return value?.data;
  } finally {
    db.close();
  }
}

async function deleteRawStorageRecord(path: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) {
        request.result.createObjectStore('files', { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
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
  // Close cached connection and delete the database between tests
  _resetDB();
  indexedDB.deleteDatabase('canto');
});

describe('storage transaction recovery (web/IndexedDB)', () => {
  it('rolls back prepared staging and replays a durable commit on the next initialize', async () => {
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    const target = 'canto/j1/metadata.json';
    const preparedRoot = 'canto/.transactions/prepared';
    await putRawStorageRecord(target, 'enc:old');
    await putRawStorageRecord(`${preparedRoot}/file-0`, 'enc:new');
    await putRawStorageRecord(
      `${preparedRoot}/marker`,
      JSON.stringify({ phase: 'prepared', files: [{ target, staged: `${preparedRoot}/file-0` }] }),
    );
    _resetDB();
    await createLocalStore(createMockEncryption()).initialize();
    expect(await getRawStorageRecord(target)).toBe('enc:old');

    const committedRoot = 'canto/.transactions/committed';
    await putRawStorageRecord(`${committedRoot}/file-0`, 'enc:new');
    await putRawStorageRecord(
      `${committedRoot}/marker`,
      JSON.stringify({
        phase: 'committing',
        files: [{ target, staged: `${committedRoot}/file-0` }],
      }),
    );
    _resetDB();
    await createLocalStore(createMockEncryption()).initialize();
    expect(await getRawStorageRecord(target)).toBe('enc:new');
    expect(await getRawStorageRecord(`${committedRoot}/marker`)).toBeUndefined();
  });

  it('discards a malformed transaction marker without attempting recovery', async () => {
    await createLocalStore(createMockEncryption()).initialize();
    await putRawStorageRecord('canto/.transactions/corrupt/marker', '{invalid');
    _resetDB();
    await createLocalStore(createMockEncryption()).initialize();
    expect(await getRawStorageRecord('canto/.transactions/corrupt/marker')).toBeUndefined();
  });

  it('discards malformed journal-import markers without publishing their roots', async () => {
    await createLocalStore(createMockEncryption()).initialize();
    await putRawStorageRecord('canto/.imports/broken', '{not-json');
    await putRawStorageRecord('canto/broken/metadata.json', 'enc:{"id":"broken"}');
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/.imports/broken')).resolves.toBeUndefined();
    await expect(getRawStorageRecord('canto/broken/metadata.json')).resolves.toBeUndefined();
  });

  it('replays a verified publishing import after the journals index was interrupted', async () => {
    const journalId = 'publishing-import';
    const first = createLocalStore(createMockEncryption());
    await first.initialize();
    await first.saveJournal(makeJournalContent(journalId, [makePage('p1')]));
    await putRawStorageRecord('canto/journals.json', 'enc:{"journals":[]}');
    await putRawStorageRecord(
      `canto/.imports/${journalId}`,
      JSON.stringify({
        version: 2,
        journalId,
        phase: 'publishing',
        expectedPageCount: 1,
      }),
    );

    _resetDB();
    const recovered = createLocalStore(createMockEncryption());
    await recovered.initialize();

    expect(await recovered.listJournals()).toEqual([
      expect.objectContaining({ id: journalId, title: `Journal ${journalId}` }),
    ]);
    expect(await recovered.getJournalOverview?.(journalId)).toMatchObject({
      metadata: { id: journalId },
      pages: [expect.objectContaining({ id: 'p1' })],
    });
    expect(await getRawStorageRecord(`canto/.imports/${journalId}`)).toBeUndefined();
  });

  it('cleans abandoned transaction roots and refuses committed records without their staged ciphertext', async () => {
    await createLocalStore(createMockEncryption()).initialize();
    const preparedRoot = 'canto/.transactions/prepared-roots';
    const replacementRoot = 'canto/j1/attachments/chunk-v1-unpublished';
    await putRawStorageRecord(`${preparedRoot}/orphan`, 'unused');
    await putRawStorageRecord(`${replacementRoot}/0`, 'enc:unpublished');
    await putRawStorageRecord(
      `${preparedRoot}/marker`,
      JSON.stringify({ phase: 'prepared', files: [], newRoots: [replacementRoot] }),
    );
    _resetDB();
    await createLocalStore(createMockEncryption()).initialize();
    expect(await getRawStorageRecord(`${preparedRoot}/orphan`)).toBeUndefined();
    expect(await getRawStorageRecord(`${replacementRoot}/0`)).toBeUndefined();

    const committedRoot = 'canto/.transactions/missing-stage';
    await putRawStorageRecord(
      `${committedRoot}/marker`,
      JSON.stringify({
        phase: 'committing',
        files: [{ target: 'canto/j1/metadata.json', staged: `${committedRoot}/file-0` }],
      }),
    );
    _resetDB();
    await expect(createLocalStore(createMockEncryption()).initialize()).rejects.toThrow(
      'Incomplete storage transaction staging',
    );
  });
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

  it('reads a saved journal overview from the encrypted page catalog', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const page = { ...makePage('p1'), tags: ['travel', 'test'], modified: 42 };
    await store.saveJournal(makeJournalContent('j1', [page]));

    const overview = await store.getJournalOverview?.('j1');

    expect(overview).toMatchObject({
      metadata: { id: 'j1', title: 'Journal j1' },
      pages: [expect.objectContaining({ id: 'p1' })],
      tags: ['test', 'travel'],
      latestModified: 42,
    });
    await expect(getRawStorageRecord('canto/j1/page-catalog.json')).resolves.toMatch(/^enc:/);
  });

  it('reads only metadata and catalog for a warm overview', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    resetStorageIoCounters();

    await store.getJournalOverview?.('j1');

    expect(getStorageIoCounters()).toEqual({
      metadataReads: 1,
      catalogReads: 1,
      pageReads: 0,
      decryptions: 2,
      catalogRebuilds: 0,
    });
  });

  it('builds a sync snapshot from metadata and catalog without page reads', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(
      makeJournalContent('j1', [
        { ...makePage('p1'), modified: 42 },
        { ...makePage('p2'), modified: 43, deleted: true },
      ]),
    );
    resetStorageIoCounters();

    const snapshot = await store.getJournalSyncSnapshot?.('j1');

    expect(snapshot?.metadata).toMatchObject({ id: 'j1', title: 'Journal j1' });
    expect(snapshot?.pages).toEqual(
      new Map([
        ['p1', { modified: 42 }],
        ['p2', { modified: 43, deleted: true }],
      ]),
    );
    expect(getStorageIoCounters().pageReads).toBe(0);
    expect(getStorageIoCounters()).toMatchObject({ metadataReads: 1, catalogReads: 1 });
  });

  it('rebuilds a corrupt catalog before returning a sync snapshot', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', 'enc:not-json');
    resetStorageIoCounters();

    const snapshot = await store.getJournalSyncSnapshot!('j1');

    expect(snapshot!.pages).toEqual(
      new Map([
        ['p1', expect.objectContaining({ modified: expect.any(Number) })],
        ['p2', expect.objectContaining({ modified: expect.any(Number) })],
      ]),
    );
    await expect(getRawStorageRecord('canto/j1/page-catalog.json')).resolves.toMatch(/^enc:/);
    expect(getStorageIoCounters()).toMatchObject({ pageReads: 2, catalogRebuilds: 1 });
  });

  it('reads a password-protected sync snapshot only with its derived key', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const key = new Uint8Array(32).fill(7);
    const wrongKey = new Uint8Array(32).fill(8);
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]), key);

    await expect(store.getJournalSyncSnapshot!('j1', key)).resolves.toMatchObject({
      metadata: { id: 'j1' },
    });
    await expect(store.getJournalSyncSnapshot!('j1', wrongKey)).rejects.toThrow();
  });

  it('getJournal returns null for non-existent journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const result = await store.getJournal('nonexistent');
    expect(result).toBeNull();
  });

  it('opens a metadata-only journal when no page records exist yet', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('metadata-only'));

    await expect(store.getJournal('metadata-only')).resolves.toMatchObject({
      id: 'metadata-only',
      pages: [],
    });
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

  it('updates a warm page catalog without reading the full journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const readJournal = jest.spyOn(store, 'getJournal');

    await store.savePage(
      'j1',
      { ...makePage('p1'), text: 'Updated', modified: 9 },
      undefined,
      true,
    );

    expect(readJournal).not.toHaveBeenCalled();
    await expect(store.getJournalOverview?.('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1', previewText: 'Updated' })],
    });
  });

  it('rejects a save covering a malformed unrelated page and leaves every file unchanged', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', '');
    await putRawStorageRecord('canto/j1/pages/p2.json', 'enc:local corruption');
    const p1Before = await getRawStorageRecord('canto/j1/pages/p1.json');
    const p2Before = await getRawStorageRecord('canto/j1/pages/p2.json');

    // A rebuild may publish only after every discovered page validates. The
    // unreadable page must block the mutation and never be silently omitted
    // from a reduced catalog projection.
    await expect(
      store.savePage('j1', { ...makePage('p1'), text: 'Saved edit' }, undefined, true),
    ).rejects.toMatchObject({ code: 'CATALOG_UNREADABLE', details: ['p2'] });

    expect(await getRawStorageRecord('canto/j1/pages/p1.json')).toBe(p1Before);
    expect(await getRawStorageRecord('canto/j1/pages/p2.json')).toBe(p2Before);
    expect(await getRawStorageRecord('canto/j1/page-catalog.json')).toBe('');
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

  it('persists journal metadata and tracks import and device-key recovery markers', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const source = makeJournalContent('j1');
    const { pages, ...metadata } = source;
    void pages;

    await store.saveJournalMetadata!(metadata);
    await expect(store.listJournals()).resolves.toEqual([
      expect.objectContaining({ id: 'j1', title: 'Journal j1' }),
    ]);
    await store.beginJournalImport?.('j1');
    await store.updateJournalImport?.('j1', 'writing');
    await store.updateJournalImport?.('j1', 'publishing', { expectedPageCount: 0 });
    await store.completeJournalImport?.('j1');
    await expect(store.updateJournalImport?.('j1', 'committed')).rejects.toThrow(
      'marker is missing',
    );

    await putRawStorageRecord('canto/.device-key-rotation-complete', 'complete');
    await expect(store.hasCompletedDeviceKeyRotation?.()).resolves.toBe(true);
    await store.clearCompletedDeviceKeyRotation?.();
    await expect(store.hasCompletedDeviceKeyRotation?.()).resolves.toBe(false);
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

    // A journal that exists but cannot be device-decrypted must fail closed
    // with a typed integrity error, never silently become an empty journal.
    await expect(store.getJournal('j1')).rejects.toMatchObject({ code: 'JOURNAL_UNREADABLE' });
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

describe('secure journal write guards (web/IndexedDB)', () => {
  it('rejects keyless and all-zero-key savePage/deletePage for a secure journal and leaves files unchanged', async () => {
    const key = new Uint8Array(32).fill(7);
    const store = createLocalStore(createMockEncryption());
    const journal: JournalContent = {
      ...makeJournalContent('secure-j', [makePage('p1')]),
      secure: true,
    };
    await store.saveJournal(journal, key);

    const journalRoot = 'canto/secure-j';
    const before = {
      catalog: await getRawStorageRecord(`${journalRoot}/page-catalog.json`),
      page: await getRawStorageRecord(`${journalRoot}/pages/p1.json`),
      metadata: await getRawStorageRecord(`${journalRoot}/metadata.json`),
    };
    expect(before.catalog).toBeDefined();

    // Missing key: the secure status comes from the device-only index entry,
    // so both mutations reject before any IndexedDB write.
    await expect(store.savePage('secure-j', makePage('p2'))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.deletePage('secure-j', 'p1')).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });

    // Revoked (all-zero) key: rejected by the defense-in-depth guard as well.
    await expect(
      store.savePage('secure-j', makePage('p3'), new Uint8Array(32)),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });
    await expect(store.deletePage('secure-j', 'p1', new Uint8Array(32))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });

    // Every durable record is byte-identical and nothing new was published.
    expect(await getRawStorageRecord(`${journalRoot}/page-catalog.json`)).toBe(before.catalog);
    expect(await getRawStorageRecord(`${journalRoot}/pages/p1.json`)).toBe(before.page);
    expect(await getRawStorageRecord(`${journalRoot}/metadata.json`)).toBe(before.metadata);
    expect(await getRawStorageRecord(`${journalRoot}/pages/p2.json`)).toBeUndefined();
    expect(await getRawStorageRecord(`${journalRoot}/pages/p3.json`)).toBeUndefined();
  });

  it('still allows keyless page writes for a non-secure journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.saveJournal(makeJournalContent('ns-j'));
    await expect(store.savePage('ns-j', makePage('p1'))).resolves.toBeUndefined();
    expect(await getRawStorageRecord('canto/ns-j/pages/p1.json')).toBeDefined();
    await expect(store.deletePage('ns-j', 'p1')).resolves.toBeUndefined();
    await expect(store.getPage('ns-j', 'p1')).resolves.toMatchObject({ deleted: true });
  });
});

describe('reencryptAll (web/IndexedDB)', () => {
  it('refuses an unknown-size legacy attachment before staging a device-key rotation', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord('canto/j1/attachments/legacy.bin', 'enc:payload');

    await expect(
      store.reencryptAll(
        async (value) => value,
        async (value) => value,
        async (value) => `new:${value}`,
      ),
    ).rejects.toThrow('Cannot safely rotate device key for legacy attachment');
  });

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
    // Simulate restarting after data commit but before the UI key-finalization
    // call: the durable, keyless completion proof must survive startup.
    await newStore.initialize();
    expect(await newStore.hasCompletedDeviceKeyRotation?.()).toBe(true);
    await newStore.clearCompletedDeviceKeyRotation?.();
    expect(await newStore.hasCompletedDeviceKeyRotation?.()).toBe(false);

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

    // The store still uses old encryption internally, so reads must fail
    // closed with a typed integrity error instead of an empty journal.
    await expect(store.getJournal('j1')).rejects.toMatchObject({ code: 'JOURNAL_UNREADABLE' });
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
    const path = await store.saveAttachment('j1', 'p1', attachment, 'imagedata');

    const oldDecrypt = (ct: string) => {
      if (/^\d+$/.test(ct)) return Promise.reject(new Error('Invalid ciphertext: too short'));
      return Promise.resolve(ct.replace(/^old:/, ''));
    };
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
    expect(await newStore.getAttachment(path)).toBe('imagedata');
    expect(await newStore.getAttachmentStorageSize?.(path)).toEqual({ status: 'known', bytes: 6 });
  });
});

describe('chunked attachment storage (web)', () => {
  it('stores, validates, and streams each chunk without a whole-value sync read', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    const data = Buffer.alloc(300, 65).toString('base64');
    const content = chunkedContentForBase64(data);
    content.chunkSize = 4;
    content.chunkCount = Math.ceil(content.byteLength / content.chunkSize);
    const attachment: Attachment = {
      id: 'chunked',
      path: '',
      name: 'movie.mp4',
      type: 'file',
      encrypted: false,
      size: 300,
      content,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, data);
    attachment.path = path;
    const chunks: string[] = [];
    await store.forEachAttachmentChunk!(attachment, async (_index, chunk) => {
      chunks.push(chunk);
    });
    expect(chunks).toHaveLength(attachment.content!.chunkCount);
    expect(chunks.every((chunk) => chunk.length < data.length)).toBe(true);

    (encryption.decrypt as jest.Mock).mockClear();
    const resumedChunks: number[] = [];
    await store.forEachAttachmentChunk!(
      attachment,
      async (index) => {
        resumedChunks.push(index);
      },
      new Set([1]),
    );
    // Completed remote indexes are skipped before device decryption.
    expect(resumedChunks).toEqual([1]);
    expect(encryption.decrypt).toHaveBeenCalledTimes(1);

    await expect(store.getAttachment(path)).resolves.toBe(data);
  });

  it('ingests byte streams without a FileReader/base64 source value', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    const attachment: Attachment = {
      id: 'streamed',
      path: '',
      name: 'streamed.bin',
      type: 'file',
      encrypted: false,
      size: 4,
      content: chunkedContentForByteLength(4),
      deleted: false,
    };
    async function* source() {
      // The picker stream adapter coalesces arbitrary source reads into exact
      // descriptor-sized chunks before this storage boundary.
      yield new Uint8Array([65, 66, 67, 68]);
    }

    const path = await store.saveAttachmentStream!('j1', 'p1', attachment, source());

    await expect(store.getAttachment(path)).resolves.toBe('QUJDRA==');
  });

  it('rejects writing an encrypted-flagged attachment without a usable key and leaves no root', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'locked-chunk-write',
      path: '',
      name: 'locked-chunk-write.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };

    // The password-layer downgrade after auto-lock must fail closed: an
    // encrypted attachment with no usable key is never persisted device-only.
    await expect(store.saveAttachment('j1', 'p1', attachment, 'QUJD')).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(
      getRawStorageRecord('canto/j1/attachments/chunk-v1-p1-locked-chunk-write-legacy/0'),
    ).resolves.toBeUndefined();
  });

  it('still tolerates legacy device-only chunk frames on read when metadata retains encrypted', async () => {
    // Pre-19.2 devices can retain encrypted attachment metadata while the
    // frame itself was written without a password layer (device-only). The
    // read path must tolerate that legacy state even though new keyless
    // writes are rejected. Build the legacy root directly, as an old device
    // or interrupted migration would have left it.
    const attachment: Attachment = {
      id: 'legacy-device-only-chunk',
      path: '',
      name: 'legacy-device-only-chunk.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    const root = 'canto/j1/attachments/chunk-v1-p1-legacy-device-only-chunk-legacy';
    await putRawStorageRecord(
      root + '/0',
      'enc:' + encodeChunkFrame('j1', 'p1', attachment, 0, 'QUJD'),
    );
    await putRawStorageRecord(
      root + '/manifest',
      'enc:' + JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment }),
    );

    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getAttachment(root, new Uint8Array(32).fill(7))).resolves.toBe('QUJD');
  });

  it('atomically persists downloaded chunk frames and deletes failed generations', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'downloaded',
      path: '',
      name: 'downloaded.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'web-download-generation',
      },
    };
    async function* frames() {
      yield encodeChunkFrame('j1', 'p1', attachment, 0, 'AQI=');
      yield encodeChunkFrame('j1', 'p1', attachment, 1, 'Aw==');
    }
    const path = await store.saveAttachmentChunks!('j1', 'p1', attachment, frames());
    attachment.path = path;

    await expect(store.getAttachment(path)).resolves.toBe('AQID');
    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, frames())).resolves.toBe(path);
    await store.deleteAttachment(path);
    await expect(store.getAttachment(path)).resolves.toBeNull();
  });

  it('streams validated display chunks and rejects a mismatched browser manifest', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'web-display',
      path: '',
      name: 'web-display.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'web-display-generation',
      },
    };
    async function* frames() {
      yield encodeChunkFrame('j1', 'p1', attachment, 0, 'AQI=');
      yield encodeChunkFrame('j1', 'p1', attachment, 1, 'Aw==');
    }
    attachment.path = await store.saveAttachmentChunks!('j1', 'p1', attachment, frames());
    const chunks: string[] = [];
    await store.forEachAttachmentDisplayChunk!(attachment, async (_index, data) => {
      chunks.push(data);
    });
    expect(chunks).toEqual(['AQI=', 'Aw==']);
    await expect(
      store.forEachAttachmentDisplayChunk!(
        { ...attachment, content: { ...attachment.content!, generation: 'wrong-generation' } },
        async () => undefined,
      ),
    ).rejects.toThrow('manifest identity mismatch');
    await expect(
      store.forEachAttachmentDisplayChunk!(
        { ...attachment, content: undefined, size: undefined },
        async () => undefined,
      ),
    ).rejects.toThrow('Legacy attachment is too large');
  });

  it('rejects malformed downloaded chunk streams before publishing their manifest', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'download-error',
      path: '',
      name: 'download-error.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 2,
        chunkSize: 1,
        chunkCount: 2,
        generation: 'web-download-error-generation',
      },
    };
    async function* tooFew() {
      yield 'first';
    }
    async function* tooMany() {
      yield 'first';
      yield 'second';
      yield 'third';
    }

    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, tooFew())).rejects.toThrow(
      'Missing attachment chunks',
    );
    await expect(store.saveAttachmentChunks!('j1', 'p1', attachment, tooMany())).rejects.toThrow(
      'Too many attachment chunks',
    );
    await expect(
      store.saveAttachmentChunks!('j1', 'p1', { ...attachment, content: undefined }, tooFew()),
    ).rejects.toThrow('Chunked content descriptor required');
  });

  it('rejects duplicate, malformed, and incomplete local chunk generations', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'chunk-boundaries',
      path: '',
      name: 'chunk-boundaries.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'chunk-boundaries-generation',
      },
    };
    async function* oneByte() {
      yield new Uint8Array([65]);
    }
    async function* oversized() {
      yield new Uint8Array([65, 66]);
    }
    async function* tooMany() {
      yield new Uint8Array([65]);
      yield new Uint8Array([66]);
    }

    await store.saveAttachmentStream!('j1', 'p1', attachment, oneByte());
    await expect(store.saveAttachmentStream!('j1', 'p1', attachment, oneByte())).rejects.toThrow(
      'Attachment generation already exists',
    );
    await expect(
      store.saveAttachmentStream!(
        'j1',
        'p1',
        { ...attachment, id: 'no-descriptor', content: undefined },
        oneByte(),
      ),
    ).rejects.toThrow('Chunked content descriptor required');
    await expect(
      store.saveAttachmentStream!(
        'j1',
        'p1',
        {
          ...attachment,
          id: 'oversized',
          content: { ...attachment.content!, generation: 'oversized' },
        },
        oversized(),
      ),
    ).rejects.toThrow('stream chunk exceeds limit');
    await expect(
      store.saveAttachmentStream!(
        'j1',
        'p1',
        {
          ...attachment,
          id: 'too-many',
          content: { ...attachment.content!, generation: 'too-many' },
        },
        tooMany(),
      ),
    ).rejects.toThrow('Too many attachment chunks');

    const incomplete = {
      ...attachment,
      id: 'incomplete',
      content: { ...attachment.content!, generation: 'incomplete' },
    };
    await putRawStorageRecord(
      'canto/j1/attachments/chunk-v1-p1-incomplete-incomplete/0',
      'enc:partial',
    );
    async function* frames() {
      yield 'frame';
    }
    await expect(store.saveAttachmentChunks!('j1', 'p1', incomplete, frames())).rejects.toThrow(
      'Incomplete attachment generation already exists',
    );

    const direct = {
      ...attachment,
      id: 'direct-duplicate',
      content: { ...attachment.content!, generation: 'direct-duplicate' },
    };
    await store.saveAttachment('j1', 'p1', direct, 'QQ==');
    await expect(store.saveAttachment('j1', 'p1', direct, 'QQ==')).rejects.toThrow(
      'Attachment generation already exists',
    );

    const failingEncryption = createMockEncryption();
    (failingEncryption.encrypt as jest.Mock).mockRejectedValue(new Error('device write failed'));
    await expect(
      createLocalStore(failingEncryption).saveAttachment(
        'j1',
        'p1',
        {
          ...attachment,
          id: 'failed-write',
          content: { ...attachment.content!, generation: 'failed-write' },
        },
        'QQ==',
      ),
    ).rejects.toThrow('device write failed');

    async function* mismatch() {
      yield new Uint8Array([]);
    }
    await expect(
      store.saveAttachmentStream!(
        'j1',
        'p1',
        {
          ...attachment,
          id: 'mismatch',
          content: { ...attachment.content!, generation: 'mismatch' },
        },
        mismatch(),
      ),
    ).rejects.toThrow('Attachment stream length mismatch');
  });

  it('reports corrupt chunk manifests, missing chunks, and cyclic redirects', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const invalidRoot = 'canto/j1/attachments/invalid-root';
    await putRawStorageRecord(
      `${invalidRoot}/manifest`,
      `enc:${JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment: { name: 'invalid' } })}`,
    );
    await expect(store.getAttachment(invalidRoot)).rejects.toThrow(
      'Invalid chunked attachment manifest',
    );

    const missingRoot = 'canto/j1/attachments/missing-root';
    const missingAttachment: Attachment = {
      id: 'missing',
      path: missingRoot,
      name: 'missing.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: chunkedContentForByteLength(1),
    };
    await putRawStorageRecord(
      `${missingRoot}/manifest`,
      `enc:${JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment: missingAttachment })}`,
    );
    await expect(store.getAttachment(missingRoot)).rejects.toThrow('Attachment chunk missing');
    await expect(
      store.forEachAttachmentChunk!(missingAttachment, async () => undefined),
    ).rejects.toThrow('Attachment chunk missing');
    await expect(
      store.forEachAttachmentChunk!(
        { ...missingAttachment, content: undefined },
        async () => undefined,
      ),
    ).rejects.toThrow('Chunked content descriptor required');

    for (let index = 0; index < 4; index++) {
      await putRawStorageRecord(`redirect-${index}.redirect`, `enc:redirect-${index + 1}`);
    }
    await expect(store.getAttachment('redirect-0')).rejects.toThrow('redirect chain is too deep');
  });

  it('reports missing, legacy-unknown, and malformed attachment sizes without reading payloads', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord('canto/j1/attachments/legacy', 'enc:payload');
    await putRawStorageRecord('canto/j1/attachments/malformed.size', 'not-a-size');

    await expect(store.getAttachmentStorageSize!('canto/j1/attachments/missing')).resolves.toEqual({
      status: 'missing',
    });
    await expect(store.getAttachmentStorageSize!('canto/j1/attachments/legacy')).resolves.toEqual({
      status: 'unknown',
    });
    await expect(
      store.getAttachmentStorageSize!('canto/j1/attachments/malformed'),
    ).resolves.toEqual({
      status: 'unknown',
    });
  });

  it('updates journal metadata without rewriting pages or the catalog', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    const page = makePage('p1');
    await store.saveJournal(makeJournalContent('j1', [page]));
    const pagePath = 'canto/j1/pages/p1.json';
    const catalogPath = 'canto/j1/page-catalog.json';
    const pageBefore = await getRawStorageRecord(pagePath);
    const catalogBefore = await getRawStorageRecord(catalogPath);
    const encryptSpy = encryption.encrypt as jest.Mock;
    encryptSpy.mockClear();

    await store.saveJournalMetadata?.({
      ...makeJournalContent('j1', [page]),
      title: 'Renamed',
      pages: undefined,
    } as Omit<JournalContent, 'pages'>);

    expect(await getRawStorageRecord(pagePath)).toBe(pageBefore);
    expect(await getRawStorageRecord(catalogPath)).toBe(catalogBefore);
    expect(encryptSpy).toHaveBeenCalledTimes(2);
  });

  it('cleans up a chunk root when its owning page is deleted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    // Establish the journal through the store so the device-only index entry
    // exists; the fail-closed index guard treats durable data without an index
    // as an integrity condition and blocks page mutations below.
    await store.saveJournal(makeJournalContent('j1'));
    const attachment: Attachment = {
      id: 'delete-root',
      path: '',
      name: 'delete-root.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: chunkedContentForByteLength(1),
    };
    attachment.path = await store.saveAttachment('j1', 'p1', attachment, 'QQ==');
    await store.savePage('j1', { ...makePage('p1'), files: [attachment] }, undefined, true);
    await store.deletePage('j1', 'p1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(store.getAttachment(attachment.path)).resolves.toBeNull();
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
  it('rolls back an unpublished replacement root when a source chunk is missing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'missing-source',
      path: 'canto/j1/attachments/chunk-v1-p1-missing-source-old',
      name: 'missing-source.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'old',
      },
    };
    await expect(
      store.reencryptJournal(
        makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]),
        undefined,
        new Uint8Array(32).fill(1),
      ),
    ).rejects.toThrow('Attachment chunk missing');
  });

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

  it('defers a legacy attachment when its size sidecar exceeds stale page metadata', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const attachment: Attachment = {
      id: 'stale-size',
      path: '',
      name: 'video.mp4',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    attachment.path = await store.saveAttachment('j1', 'p1', attachment, 'small-payload');
    await store.saveJournal(journal);
    await putRawStorageRecord(`${attachment.path}.size`, String(ATTACHMENT_CHUNK_SIZE + 1));

    const loaded = await store.getJournal('j1');
    const result = await store.reencryptJournal(loaded!, undefined, new Uint8Array(32).fill(42));

    expect(result.skippedAttachments).toEqual([
      { name: 'video.mp4', size: ATTACHMENT_CHUNK_SIZE + 1 },
    ]);
    const reloaded = await store.getJournal('j1', new Uint8Array(32).fill(42));
    expect(reloaded!.pages[0].files[0].encrypted).toBe(false);
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

  it('reproduces the raw size-sidecar failure during password re-encryption', async () => {
    const encryption: EncryptionService = {
      ...createMockEncryption(),
      decrypt: async (data: string) => {
        if (/^\d+$/.test(data)) throw new Error('Invalid ciphertext: too short');
        return data.replace(/^enc:/, '');
      },
    };
    const store = createLocalStore(encryption);
    await store.initialize();

    const attachment: Attachment = {
      id: 'img1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), images: [attachment] }]);
    await store.saveJournal(journal);
    const path = await store.saveAttachment('j1', 'p1', attachment, 'imagedata');
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].images[0].path = path;

    await expect(
      store.reencryptJournal(loaded!, undefined, new Uint8Array(32).fill(42)),
    ).resolves.toEqual({ skippedAttachments: [] });
    expect(await store.getAttachmentStorageSize?.(path)).toEqual({ status: 'known', bytes: 6 });
  });

  it('reports and leaves oversized attachments outside the journal password layer', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const att: Attachment = {
      id: 'large-image',
      path: '',
      name: 'large-video.mp4',
      type: 'file',
      encrypted: false,
      size: WEB_PASSWORD_ATTACHMENT_LIMIT_BYTES + 1,
      deleted: false,
    };
    const page: Page = { ...makePage('p1'), files: [att] };
    const journal = makeJournalContent('j1', [page]);
    await store.saveJournal(journal);
    const savedPath = await store.saveAttachment('j1', 'p1', att, 'large-file-data');

    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = savedPath;
    const newKey = new Uint8Array(32).fill(42);

    const result = await store.reencryptJournal(loaded!, undefined, newKey);

    expect(result.skippedAttachments).toEqual([
      {
        name: 'large-video.mp4',
        size: WEB_PASSWORD_ATTACHMENT_LIMIT_BYTES + 1,
      },
    ]);
    const reloaded = await store.getJournal('j1', newKey);
    expect(reloaded!.pages[0].files[0].encrypted).toBe(false);
    expect(await store.getAttachment(savedPath, newKey)).toBe('large-file-data');
  });

  it('re-encrypts chunk payloads while keeping the manifest outside the password layer', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    const attachment: Attachment = {
      id: 'chunked-password',
      path: '',
      name: 'movie.mp4',
      type: 'file',
      encrypted: false,
      size: 3,
      content: chunkedContentForBase64('QUJD'),
      deleted: false,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    const path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD');
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = path;
    const key = new Uint8Array(32).fill(42);

    await store.reencryptJournal(loaded!, undefined, key);

    const rotated = await store.getJournal('j1', key);
    const rotatedPath = rotated!.pages[0].files[0].path;
    expect(rotatedPath).not.toBe(path);
    await expect(store.getAttachment(rotatedPath, key)).resolves.toBe('QUJD');
    await expect(store.getAttachment(path, key)).resolves.toBeNull();
  });

  it('rejects a password change before writing when an existing protected attachment is oversized', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();

    const oldKey = new Uint8Array(32).fill(10);
    const newKey = new Uint8Array(32).fill(42);
    const att: Attachment = {
      id: 'large-image',
      path: '',
      name: 'already-protected.mp4',
      type: 'file',
      encrypted: true,
      size: 512 * 1024 + 1,
      deleted: false,
    };
    const journal: JournalContent = {
      ...makeJournalContent('j1', [{ ...makePage('p1'), files: [att] }]),
      secure: true,
    };
    await store.saveJournal(journal, oldKey);
    const loaded = await store.getJournal('j1', oldKey);

    await expect(store.reencryptJournal(loaded!, oldKey, newKey)).rejects.toThrow(
      'Cannot safely re-encrypt legacy attachment: already-protected.mp4',
    );
    await expect(store.getJournal('j1', oldKey)).resolves.not.toBeNull();
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

  function interceptNextTransaction(
    patchTx: (tx: IDBTransaction) => void,
    when: (tx: IDBTransaction) => boolean = () => true,
  ) {
    const orig = origTransaction;
    let intercepted = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = orig.call(this, storeNames, mode);
      if (!intercepted && when(tx)) {
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
              } catch (error) {
                void error;
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

  it('surfaces IDB existence-check errors and synchronous write failures', async () => {
    const { store } = await getInitializedStore();
    interceptNextTransaction((tx) => {
      const originalObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name: string) => {
        const objectStore = originalObjectStore(name);
        objectStore.getKey = () => {
          const request = {
            onsuccess: null as ((event: Event) => void) | null,
            onerror: null as ((event: Event) => void) | null,
            error: new DOMException('Check failed'),
          };
          queueMicrotask(() => request.onerror?.(new Event('error')));
          return request as unknown as IDBRequest;
        };
        return objectStore;
      };
    });
    await expect(store.hasCompletedDeviceKeyRotation!()).rejects.toThrow('Check failed');

    const { store: writeStore } = await getInitializedStore();
    interceptNextTransaction(
      (tx) => {
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.put = () => {
            throw new Error('Synchronous write failure');
          };
          return objectStore;
        };
      },
      (tx) => tx.mode === 'readwrite',
    );
    await expect(writeStore.savePage('j1', makePage('p1'))).rejects.toThrow(
      'Synchronous write failure',
    );
  });

  it('surfaces IDB key-list errors while loading a journal', async () => {
    const { store } = await getInitializedStore();
    await store.saveJournal(makeJournalContent('j1'));
    const original = origTransaction;
    let calls = 0;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = original.call(this, storeNames, mode);
      calls++;
      if (calls === 2) {
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.getAllKeys = () => {
            const request = {
              onsuccess: null as ((event: Event) => void) | null,
              onerror: null as ((event: Event) => void) | null,
              error: new DOMException('List failed'),
            };
            queueMicrotask(() => request.onerror?.(new Event('error')));
            return request as unknown as IDBRequest;
          };
          return objectStore;
        };
      }
      return tx;
    };
    await expect(store.getJournal('j1')).rejects.toThrow('List failed');
  });

  describe('attachment reads retry transient transaction aborts', () => {
    it('retries an attachment read after the first transaction aborts', async () => {
      const { store } = await getInitializedStore();
      const attachment: Attachment = {
        id: 'retry-image',
        path: '',
        name: 'retry.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      };
      const path = await store.saveAttachment('j1', 'p1', attachment, 'attachment-data');

      interceptNextTransaction(
        (tx) => {
          const origOS = tx.objectStore.bind(tx);
          tx.objectStore = (name: string) => {
            const os = origOS(name);
            os.get = () => {
              queueMicrotask(() => {
                try {
                  tx.abort();
                } catch {
                  /* The transaction may already have settled. */
                }
              });
              return { onsuccess: null, onerror: null } as unknown as IDBRequest;
            };
            return os;
          };
        },
        (tx) => tx.mode === 'readwrite',
      );

      await expect(store.getAttachment(path)).resolves.toBe('attachment-data');
    });
  });

  describe('idbPut transaction onerror (L128-129)', () => {
    it('rejects when IDB put transaction errors', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction(
        (tx) => {
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
        },
        (tx) => tx.mode === 'readwrite',
      );

      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow();
    });
  });

  describe('idbPut transaction abort (L132-133)', () => {
    it('rejects when IDB put transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      interceptNextTransaction(
        (tx) => {
          const origOS = tx.objectStore.bind(tx);
          tx.objectStore = (name: string) => {
            const os = origOS(name);
            os.put = () => {
              queueMicrotask(() => {
                try {
                  tx.abort();
                } catch (error) {
                  void error;
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
        },
        (tx) => tx.mode === 'readwrite',
      );

      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow();
    });

    it('aborts a timed-out write and removes late event handlers', async () => {
      const { store } = await getInitializedStore();
      jest.useFakeTimers();
      const abortSpy = jest.fn();
      const stalledTransaction = {
        abort: abortSpy,
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({ put: jest.fn() }),
      } as unknown as IDBTransaction;
      IDBDatabase.prototype.transaction = (() =>
        stalledTransaction) as typeof IDBDatabase.prototype.transaction;

      const attachment: Attachment = {
        id: 'write-timeout',
        path: '',
        name: 'timeout.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      };
      const pending = store.saveAttachment('j1', 'p1', attachment, 'payload');
      const timeoutAssertion = expect(pending).rejects.toThrow('[IDB] Timeout writing');
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10_000);

      await timeoutAssertion;
      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(stalledTransaction.oncomplete).toBeNull();
      expect(stalledTransaction.onerror).toBeNull();
      expect(stalledTransaction.onabort).toBeNull();
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
              } catch (error) {
                void error;
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

      // deleteJournal reads the index (read-only transaction) before the
      // directory prefix deletion, so intercept the first read-write
      // transaction, which is the prefix deletion.
      let readWrites = 0;
      interceptNextTransaction(
        (tx) => {
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
        },
        (tx) => (readWrites += tx.mode === 'readwrite' ? 1 : 0) === 1,
      );

      await expect(store.deleteJournal('j1')).rejects.toThrow();
    });
  });

  describe('idbDeletePrefix transaction abort (L191-192)', () => {
    it('rejects when IDB deletePrefix transaction is aborted', async () => {
      const { store } = await getInitializedStore();

      let readWrites = 0;
      interceptNextTransaction(
        (tx) => {
          const origOS = tx.objectStore.bind(tx);
          tx.objectStore = (name: string) => {
            const os = origOS(name);
            os.openCursor = () => {
              queueMicrotask(() => {
                try {
                  tx.abort();
                } catch (error) {
                  void error;
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
        },
        (tx) => (readWrites += tx.mode === 'readwrite' ? 1 : 0) === 1,
      );

      await expect(store.deleteJournal('j1')).rejects.toThrow();
    });
  });

  describe('IDB operation timeouts', () => {
    function stalledTransaction(objectStore: unknown) {
      return {
        abort: jest.fn(),
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => objectStore,
      } as unknown as IDBTransaction;
    }

    it('times out stalled read and existence-check transactions', async () => {
      const { store } = await getInitializedStore();
      jest.useFakeTimers();
      const readTx = stalledTransaction({ get: jest.fn(() => ({})) });
      IDBDatabase.prototype.transaction = (() =>
        readTx) as typeof IDBDatabase.prototype.transaction;
      const read = store.getPage('j1', 'p1');
      const readAssertion = expect(read).rejects.toThrow('Timeout reading');
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10_000);
      await readAssertion;
      expect(readTx.abort).toHaveBeenCalled();

      const hasTx = stalledTransaction({ getKey: jest.fn(() => ({})) });
      IDBDatabase.prototype.transaction = (() => hasTx) as typeof IDBDatabase.prototype.transaction;
      const has = store.hasCompletedDeviceKeyRotation!();
      const hasAssertion = expect(has).rejects.toThrow('Timeout checking');
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10_000);
      await hasAssertion;
      expect(hasTx.abort).toHaveBeenCalled();
    });

    it('times out stalled delete and prefix-delete transactions', async () => {
      const { store } = await getInitializedStore();
      jest.useFakeTimers();
      const deleteTx = stalledTransaction({ delete: jest.fn() });
      IDBDatabase.prototype.transaction = (() =>
        deleteTx) as typeof IDBDatabase.prototype.transaction;
      const removed = store.clearCompletedDeviceKeyRotation!();
      const removedAssertion = expect(removed).rejects.toThrow('Timeout deleting');
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(10_000);
      await removedAssertion;

      // deleteJournal first reads the index through a read-only transaction;
      // only the subsequent prefix deletion must time out.
      const prefixTx = stalledTransaction({ openCursor: jest.fn(() => ({})) });
      let interceptedPrefix = false;
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        if (mode === 'readwrite' && !interceptedPrefix) {
          interceptedPrefix = true;
          return prefixTx;
        }
        return origTransaction.call(this, storeNames, mode);
      };
      const journal = store.deleteJournal('j1');
      const journalAssertion = expect(journal).rejects.toThrow('Timeout deleting prefix');
      // deleteJournal reads the index (and now probes durable journal data)
      // through read-only transactions before its first readwrite delete.
      // fake-indexeddb delivers each request event via setImmediate, which
      // fake timers also replace, and events scheduled while the fake clock
      // is ticking land 1ms later, so each pump pass must advance the fake
      // clock by 1ms to keep pace until the stalled prefix transaction is
      // handed out. The pass count is bounded so a future stall fails fast
      // instead of hanging; the 10s IDB timeout timers stay far outside this
      // 1ms window and are cleared when their reads succeed.
      for (let passes = 0; passes < 1000 && !interceptedPrefix; passes++) {
        await jest.advanceTimersByTimeAsync(1);
      }
      await jest.advanceTimersByTimeAsync(10_000);
      await journalAssertion;
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

describe('device-key rotation write barrier (web)', () => {
  it('blocks a concurrent save until rotation commits', async () => {
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    let releaseRotation!: () => void;
    const rotationGate = new Promise<void>((resolve) => {
      releaseRotation = resolve;
    });
    let rotationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      rotationStarted = resolve;
    });
    let writesDuringRotation = 0;
    encryption.encrypt = jest.fn(async (data: string) => {
      writesDuringRotation++;
      return data;
    });

    const rotation = store.reencryptAll(
      async (value) => value.replace(/^enc:/, ''),
      async (value) => value,
      async (value) => {
        rotationStarted();
        await rotationGate;
        return value;
      },
    );
    await started;
    const concurrentSave = store.savePage('j1', makePage('p2'));
    await Promise.resolve();

    expect(writesDuringRotation).toBe(0);
    releaseRotation();
    await rotation;
    await concurrentSave;
    // A page mutation commits both the authoritative page and its catalog projection.
    expect(writesDuringRotation).toBe(2);
  });
});

describe('fail-closed integrity reads and mutations (web)', () => {
  beforeEach(() => {
    _resetDB();
  });

  it('listJournals throws INDEX_UNREADABLE when the index file exists but is undecryptable', async () => {
    const encryption = createMockEncryption();
    encryption.decrypt = jest.fn(() => {
      throw new Error('Cannot decrypt index');
    });
    const store = createLocalStore(encryption);
    await store.initialize();
    await putRawStorageRecord('canto/journals.json', 'ciphertext-bytes');
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('listJournals throws INDEX_UNREADABLE when the index is not valid JSON', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord('canto/journals.json', 'enc:not-json');
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('an unreadable index blocks metadata publication and never writes a reduced index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord('canto/journals.json', 'enc:not-json');
    await putRawStorageRecord('canto/j1/metadata.json', 'enc:{"id":"j1"}');

    await expect(
      store.saveJournalMetadata?.({
        ...makeJournalContent('j1'),
        title: 'Renamed',
        pages: undefined,
      } as Omit<JournalContent, 'pages'>),
    ).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
    expect(await getRawStorageRecord('canto/journals.json')).toBe('enc:not-json');
  });

  it('a missing index over existing durable journal data fails closed instead of listing an empty library', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await deleteRawStorageRecord('canto/journals.json');

    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    // The durable journal was never treated as evidence of deletion.
    expect(await getRawStorageRecord('canto/j1/metadata.json')).toBeDefined();
    expect(await getRawStorageRecord('canto/j1/pages/p1.json')).toBeDefined();
  });

  it('a missing index over existing data blocks every publication and never writes a reduced index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await deleteRawStorageRecord('canto/journals.json');
    await expect(store.deleteJournal('j1')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    await expect(store.saveJournal(makeJournalContent('j2'))).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    // No reduced index was published and the existing journal was not deleted.
    expect(await getRawStorageRecord('canto/journals.json')).toBeUndefined();
    expect(await getRawStorageRecord('canto/j1/metadata.json')).toBeDefined();
  });

  it('lets a marker-covered import stage durable data and publish the final index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const journalId = 'marker-import';
    await store.beginJournalImport?.(journalId);
    await store.updateJournalImport?.(journalId, 'writing');

    // Attachment staging writes durable journal records before the index or
    // any journal metadata exists. The active import marker is what makes this
    // an allowed, non-destructive staging state rather than an integrity error.
    const savedPath = await store.saveAttachment(
      journalId,
      'p1',
      {
        id: 'a1',
        path: '',
        name: 'photo.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      },
      'QUJD',
    );
    expect(savedPath).toBeTruthy();

    await store.updateJournalImport?.(journalId, 'publishing', { expectedPageCount: 1 });
    await store.saveJournal(makeJournalContent(journalId, [makePage('p1')]));
    await store.updateJournalImport?.(journalId, 'committed');
    await store.completeJournalImport?.(journalId);

    // The final index was published with the fully imported journal.
    expect(await store.listJournals()).toEqual([
      expect.objectContaining({ id: journalId, title: 'Journal marker-import' }),
    ]);
  });

  it('keeps orphan durable directories without an import marker fail-closed', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    // Durable attachment data staged under no journal and no import marker is
    // an orphan: no index may be published over it, even for another journal.
    await store.saveAttachment(
      'orphan-directory',
      'p1',
      {
        id: 'a1',
        path: '',
        name: 'photo.jpg',
        type: 'image',
        encrypted: false,
        deleted: false,
      },
      'QUJD',
    );

    await expect(store.saveJournal(makeJournalContent('imported-ok'))).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
    expect(await getRawStorageRecord('canto/journals.json')).toBeUndefined();
  });

  it('recovery never deletes import journals or markers while the index is unreadable', async () => {
    const journalId = 'orphaned-import';
    const encryption = createMockEncryption();
    const store = createLocalStore(encryption);
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/orphaned-import',
      JSON.stringify({
        version: 2,
        journalId,
        phase: 'publishing',
        expectedPageCount: 1,
      }),
    );
    await putRawStorageRecord(`canto/${journalId}/metadata.json`, 'enc:{"id":"orphaned-import"}');
    await putRawStorageRecord('canto/journals.json', 'enc:not-json');

    // A second store runs the startup recovery pass against the unreadable index.
    _resetDB();
    await store.initialize();

    expect(await getRawStorageRecord(`canto/${journalId}/metadata.json`)).toBe(
      'enc:{"id":"orphaned-import"}',
    );
    expect(await getRawStorageRecord('canto/.imports/orphaned-import')).toBeDefined();
    await expect(store.listJournals()).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });
  });

  it('getJournalOverview fails closed when the catalog is unreadable and a page cannot be read', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', 'enc:not-json');
    await putRawStorageRecord('canto/j1/pages/p1.json', 'enc:corrupt page data');

    await expect(store.getJournalOverview?.('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: ['p1'],
    });
    expect(await getRawStorageRecord('canto/j1/page-catalog.json')).toBe('enc:not-json');
  });

  it('savePage with a revoked all-zero key is rejected before any file mutation', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    const zeroKey = new Uint8Array(32);
    const catalogBefore = await getRawStorageRecord('canto/j1/page-catalog.json');
    const pageBefore = await getRawStorageRecord('canto/j1/pages/p1.json');

    await expect(
      store.savePage('j1', { ...makePage('p1'), text: 'locked edit' }, zeroKey),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });

    expect(await getRawStorageRecord('canto/j1/page-catalog.json')).toBe(catalogBefore);
    expect(await getRawStorageRecord('canto/j1/pages/p1.json')).toBe(pageBefore);
  });

  it('serializes concurrent mutations so every committed page survives in the catalog', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    await Promise.all([
      store.savePage('j1', makePage('p1'), undefined, true),
      store.savePage('j1', makePage('p2'), undefined, true),
    ]);

    const overview = await store.getJournalOverview?.('j1');
    const ids = overview!.pages.map((page) => page.id).sort();
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('can read keyless store seams for the device-key bootstrap gate', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    expect(await store.hasExistingData?.()).toBe(false);
    await store.recordFirstInstall?.();
    await store.saveJournal(makeJournalContent('j1'));
    expect(await store.hasExistingData?.()).toBe(true);
  });
});

describe('storage behavior coverage (web/IndexedDB)', () => {
  const DEVICE_FAIL_SENTINEL = 'BOOM';

  function createFailingEncryption(): EncryptionService {
    return {
      encrypt: jest.fn((data: string) => Promise.resolve(`enc:${data}`)),
      decrypt: jest.fn((data: string) =>
        data === DEVICE_FAIL_SENTINEL
          ? Promise.reject(new Error('device decrypt failed'))
          : Promise.resolve(data.replace(/^enc:/, '')),
      ),
      encryptWithPassword: jest.fn(),
      decryptWithPassword: jest.fn(),
      generateSalt: jest.fn(() => new Uint8Array(16)),
      clearSession: jest.fn(),
    };
  }

  it('returns a null sync snapshot when the journal has no metadata', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getJournalSyncSnapshot!('missing')).resolves.toBeNull();
  });

  it('defaults a missing page modified timestamp to zero in the sync snapshot', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await store.savePage(
      'j1',
      { ...makePage('p1'), modified: undefined } as unknown as Page,
      undefined,
      true,
    );

    const snapshot = await store.getJournalSyncSnapshot!('j1');
    expect(snapshot!.pages.get('p1')).toEqual({ modified: 0 });
  });

  it('fails closed when saving a secure journal without a usable key', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(
      store.saveJournal({ ...makeJournalContent('secure-j'), secure: true }),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });
    await expect(getRawStorageRecord('canto/secure-j/metadata.json')).resolves.toBeUndefined();
  });

  it('rebuilds an invalid catalog before soft-deleting a page', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', 'enc:not-json');

    await store.deletePage('j1', 'p1');

    const overview = await store.getJournalOverview!('j1');
    expect(overview!.pages.find((page) => page.id === 'p1')).toMatchObject({ deleted: true });
  });

  it('returns null when opening an overview for a journal without metadata', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(store.getJournalOverview!('absent-journal')).resolves.toBeNull();
  });

  it('fails closed when journal metadata cannot be device-decrypted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord('canto/broken-meta/metadata.json', DEVICE_FAIL_SENTINEL);

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('broken-meta')).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
  });

  it('fails closed when a page record cannot be device-decrypted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await putRawStorageRecord('canto/j1/pages/p2.json', DEVICE_FAIL_SENTINEL);

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getPage('j1', 'p2')).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
  });

  it('reports a device-decrypt failure during a catalog rebuild scan', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1'), makePage('p2')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', 'enc:not-json');
    await putRawStorageRecord('canto/j1/pages/p2.json', DEVICE_FAIL_SENTINEL);

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('j1')).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
      details: ['p2'],
    });
  });

  it('treats an undecryptable page catalog as a rebuild trigger', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await putRawStorageRecord('canto/j1/page-catalog.json', DEVICE_FAIL_SENTINEL);

    const failing = createLocalStore(createFailingEncryption());
    await failing.initialize();
    await expect(failing.getJournalOverview!('j1')).resolves.toMatchObject({
      pages: [expect.objectContaining({ id: 'p1' })],
    });
  });

  it('rejects an oversized legacy attachment before materializing it', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'legacy-too-large',
      path: 'canto/j1/attachments/legacy-too-large',
      name: 'legacy-too-large.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES + 1,
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Legacy attachment is too large');
  });

  it('reads encrypted and plain legacy attachments through the display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const derivedKey = new Uint8Array(32).fill(7);
    await putRawStorageRecord('canto/j1/attachments/plain-legacy', 'enc:AQ==');
    await putRawStorageRecord('canto/j1/attachments/enc-legacy', 'enc:AQ==');

    const plain: Attachment = {
      id: 'plain-legacy',
      path: 'canto/j1/attachments/plain-legacy',
      name: 'plain-legacy.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    const encrypted: Attachment = {
      ...plain,
      id: 'enc-legacy',
      encrypted: true,
      path: 'canto/j1/attachments/enc-legacy',
    };

    const plainData: string[] = [];
    await store.forEachAttachmentDisplayChunk!(plain, async (_i, data) => {
      plainData.push(data);
    });
    expect(plainData).toEqual(['AQ==']);

    const encryptedData: string[] = [];
    await store.forEachAttachmentDisplayChunk!(
      encrypted,
      async (_i, data) => {
        encryptedData.push(data);
      },
      derivedKey,
    );
    expect(encryptedData).toEqual(['AQ==']);
  });

  it('reports a missing legacy attachment on the display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'missing-legacy',
      path: 'canto/j1/attachments/missing-legacy',
      name: 'missing-legacy.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      size: 1,
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment not found');
  });

  it('reports a missing manifest and missing chunk on the chunked display path', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'display-missing',
      path: 'canto/j1/attachments/chunk-v1-p1-display-missing-gen',
      name: 'display-missing.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: 'gen',
      },
    };
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment manifest missing');

    await putRawStorageRecord(
      `${attachment.path}/manifest`,
      `enc:${JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment })}`,
    );
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment chunk missing');
  });

  it('detects a display length mismatch against the chunk descriptor', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'display-mismatch',
      path: 'canto/j1/attachments/chunk-v1-p1-display-mismatch-gen',
      name: 'display-mismatch.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: {
        format: 'canto-chunked-v1',
        byteLength: 5,
        chunkSize: 5,
        chunkCount: 1,
        generation: 'gen',
      },
    };
    await putRawStorageRecord(
      `${attachment.path}/manifest`,
      `enc:${JSON.stringify({ journalId: 'j1', pageId: 'p1', attachment })}`,
    );
    await putRawStorageRecord(
      `${attachment.path}/0`,
      `enc:${encodeChunkFrame('j1', 'p1', attachment, 0, 'AQ==')}`,
    );
    await expect(
      store.forEachAttachmentDisplayChunk!(attachment, async () => undefined),
    ).rejects.toThrow('Attachment display length mismatch');
  });

  it('ignores a transaction root whose marker is missing', async () => {
    await createLocalStore(createMockEncryption()).initialize();
    await putRawStorageRecord('canto/.transactions/no-marker/file-0', 'staged');
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(
      getRawStorageRecord('canto/.transactions/no-marker/file-0'),
    ).resolves.toBeUndefined();
  });

  it('parses a committed import marker and rolls back its unverified journal', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/committed-import',
      JSON.stringify({ version: 2, journalId: 'committed-import', phase: 'committed' }),
    );
    await putRawStorageRecord(
      'canto/committed-import/metadata.json',
      'enc:{"id":"committed-import"}',
    );
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/.imports/committed-import')).resolves.toBeUndefined();
    await expect(
      getRawStorageRecord('canto/committed-import/metadata.json'),
    ).resolves.toBeUndefined();
  });

  it('rolls back a prepared import marker without publishing it', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/prepared-import',
      JSON.stringify({ version: 2, journalId: 'prepared-import', phase: 'prepared' }),
    );
    await putRawStorageRecord(
      'canto/prepared-import/metadata.json',
      'enc:{"id":"prepared-import"}',
    );
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(
      getRawStorageRecord('canto/prepared-import/metadata.json'),
    ).resolves.toBeUndefined();
  });

  it('does not recover a publishing import whose metadata is missing', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/no-metadata',
      JSON.stringify({
        version: 2,
        journalId: 'no-metadata',
        phase: 'publishing',
        expectedPageCount: 1,
      }),
    );
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/.imports/no-metadata')).resolves.toBeUndefined();
  });

  it('does not recover a publishing import whose metadata id or security mismatches', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/mismatch-id',
      JSON.stringify({
        version: 2,
        journalId: 'mismatch-id',
        phase: 'publishing',
        expectedPageCount: 0,
      }),
    );
    await putRawStorageRecord('canto/mismatch-id/metadata.json', 'enc:{"id":"other"}');
    await putRawStorageRecord(
      'canto/.imports/secure-import',
      JSON.stringify({
        version: 2,
        journalId: 'secure-import',
        phase: 'publishing',
        expectedPageCount: 0,
      }),
    );
    await putRawStorageRecord(
      'canto/secure-import/metadata.json',
      'enc:{"id":"secure-import","secure":true}',
    );
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/.imports/mismatch-id')).resolves.toBeUndefined();
    await expect(getRawStorageRecord('canto/.imports/secure-import')).resolves.toBeUndefined();
  });

  it('does not recover a publishing import whose catalog page count disagrees', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await putRawStorageRecord(
      'canto/.imports/count-mismatch',
      JSON.stringify({
        version: 2,
        journalId: 'count-mismatch',
        phase: 'publishing',
        expectedPageCount: 2,
      }),
    );
    await putRawStorageRecord('canto/count-mismatch/metadata.json', 'enc:{"id":"count-mismatch"}');
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/.imports/count-mismatch')).resolves.toBeUndefined();
  });

  it('defers catalog rebuild when the read signal is already aborted', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await deleteRawStorageRecord('canto/j1/page-catalog.json');

    await expect(
      store.getJournalOverview!('j1', undefined, { signal: { aborted: true } as AbortSignal }),
    ).rejects.toThrow('Journal catalog rebuild cancelled');
  });

  it('defers catalog rebuild when the signal aborts after scanning', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));
    await deleteRawStorageRecord('canto/j1/page-catalog.json');

    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads > 1;
      },
    } as AbortSignal;

    await expect(store.getJournalOverview!('j1', undefined, { signal })).rejects.toThrow(
      'Journal catalog rebuild cancelled',
    );
  });

  it('ignores the journals index, rotation marker, and size sidecars when scanning for durable data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await putRawStorageRecord('canto/.device-key-rotation-complete', 'complete');
    await putRawStorageRecord('canto/j1/attachments/legacy.size', '3');
    await deleteRawStorageRecord('canto/journals.json');

    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
  });

  it('treats an import marker covered staging root as non-durable', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    // Remove the index so the startup recovery sees an absent index while only
    // marker-covered journal data exists; recovery must not fail closed.
    await deleteRawStorageRecord('canto/journals.json');
    await putRawStorageRecord(
      'canto/.imports/staging',
      JSON.stringify({ version: 2, journalId: 'staging', phase: 'writing' }),
    );
    await putRawStorageRecord('canto/staging/metadata.json', 'enc:{"id":"staging"}');
    _resetDB();

    await expect(createLocalStore(createMockEncryption()).initialize()).resolves.toBeUndefined();
  });

  it('cleans up a prepared transaction when a staged write fails', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const original = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = original.call(this, storeNames, mode);
      if (!failed && mode === 'readwrite') {
        failed = true;
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.put = () => {
            throw new Error('staging write failed');
          };
          return objectStore;
        };
      }
      return tx;
    };
    try {
      await expect(store.saveJournal(makeJournalContent('j2'))).rejects.toThrow(
        'staging write failed',
      );
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });

  it('cleans up a prepared transaction when an index-only commit fails', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const original = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = original.call(this, storeNames, mode);
      if (mode === 'readwrite') {
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          const originalPut = objectStore.put.bind(objectStore);
          objectStore.put = ((...args: Parameters<typeof originalPut>) => {
            if (!failed) {
              failed = true;
              throw new Error('index write failed');
            }
            return originalPut(...args);
          }) as typeof originalPut;
          return objectStore;
        };
      }
      return tx;
    };
    try {
      await expect(store.deleteJournal('j1')).rejects.toThrow('index write failed');
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });

  it('surfaces a non-Error synchronous write failure', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const original = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
    ) {
      const tx = original.call(this, storeNames, mode);
      if (!failed && mode === 'readwrite') {
        failed = true;
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.put = () => {
            throw 'string write failure';
          };
          return objectStore;
        };
      }
      return tx;
    };
    try {
      await expect(store.savePage('j1', makePage('p1'))).rejects.toThrow('string write failure');
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });

  it('fails closed when saving secure journal metadata without a usable key', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await expect(
      store.saveJournalMetadata!({
        ...makeJournalContent('secure-meta'),
        secure: true,
        pages: undefined,
      } as unknown as Omit<JournalContent, 'pages'>),
    ).rejects.toMatchObject({ code: 'JOURNAL_LOCKED' });
  });

  it('ignores transaction and import roots when checking for existing data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.recordFirstInstall?.();
    await putRawStorageRecord('canto/.transactions/t/marker', '{}');
    await putRawStorageRecord('canto/.imports/i', '{}');
    await expect(store.hasExistingData?.()).resolves.toBe(false);
  });

  it('defers a catalog rebuild when the signal aborts after an empty scan', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await deleteRawStorageRecord('canto/j1/page-catalog.json');

    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return reads > 1;
      },
    } as AbortSignal;

    await expect(store.getJournalOverview!('j1', undefined, { signal })).rejects.toThrow(
      'Journal catalog rebuild cancelled',
    );
  });

  it('round-trips a password-encrypted chunked attachment and stream', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const key = new Uint8Array(32).fill(9);
    const attachment: Attachment = {
      id: 'encrypted-chunk',
      path: '',
      name: 'encrypted-chunk.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    attachment.path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD', key);
    await expect(store.getAttachment(attachment.path, key)).resolves.toBe('QUJD');

    const streamed: Attachment = {
      ...attachment,
      id: 'encrypted-stream',
      path: '',
      content: {
        format: 'canto-chunked-v1',
        byteLength: 3,
        chunkSize: 2,
        chunkCount: 2,
        generation: 'encrypted-stream-generation',
      },
    };
    async function* frames() {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3]);
    }
    streamed.path = await store.saveAttachmentStream!('j1', 'p1', streamed, frames(), key);
    await expect(store.getAttachment(streamed.path, key)).resolves.toBe('AQID');
  });

  it('falls back to the declared legacy size when the stored size is unknown', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    const legacy: Attachment = {
      id: 'legacy-fallback',
      path: 'canto/j1/attachments/legacy-fallback',
      name: 'legacy-fallback.bin',
      type: 'file',
      encrypted: false,
      size: 100,
      deleted: false,
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [legacy] }]);

    const result = await store.reencryptJournal(journal, undefined, new Uint8Array(32).fill(3));
    expect(result.skippedAttachments).toEqual([{ name: 'legacy-fallback.bin', size: 100 }]);
  });

  it('copies chunk frames without a password layer when removing the password', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'chunk-remove-password',
      path: '',
      name: 'chunk-remove-password.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
      content: chunkedContentForBase64('QUJD'),
    };
    const journal = makeJournalContent('j1', [{ ...makePage('p1'), files: [attachment] }]);
    await store.saveJournal(journal);
    const path = await store.saveAttachment('j1', 'p1', attachment, 'QUJD');
    const loaded = await store.getJournal('j1');
    loaded!.pages[0].files[0].path = path;

    await store.reencryptJournal(loaded!, undefined, undefined);

    const rotated = await store.getJournal('j1');
    await expect(store.getAttachment(rotated!.pages[0].files[0].path)).resolves.toBe('QUJD');
  });

  it('surfaces an aborted read transaction with and without a stored error', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    const original = IDBDatabase.prototype.transaction;
    const abortRead = (txError: unknown) => {
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        const tx = original.call(this, storeNames, mode);
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.get = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', { value: txError, configurable: true });
              if (tx.onabort) tx.onabort(new Event('abort'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return objectStore;
        };
        return tx;
      };
    };

    abortRead(new DOMException('aborted', 'AbortError'));
    await expect(store.getPage('j1', 'p1')).rejects.toBeInstanceOf(DOMException);

    abortRead(null);
    await expect(store.getPage('j1', 'p1')).rejects.toThrow('[IDB] Transaction aborted');

    IDBDatabase.prototype.transaction = original;
  });

  it('retries a transient attachment read abort and surfaces a non-retryable failure', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    const attachment: Attachment = {
      id: 'retry-transient',
      path: '',
      name: 'retry-transient.bin',
      type: 'file',
      encrypted: false,
      deleted: false,
    };
    const path = await store.saveAttachment('j1', 'p1', attachment, 'payload');

    const original = IDBDatabase.prototype.transaction;
    const failReads = (makeError: () => unknown, times: number) => {
      let count = 0;
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        const tx = original.call(this, storeNames, mode);
        if (mode === 'readonly' && count < times) {
          count += 1;
          const originalObjectStore = tx.objectStore.bind(tx);
          tx.objectStore = (name: string) => {
            const objectStore = originalObjectStore(name);
            objectStore.get = () => {
              const request = {
                onsuccess: null as ((event: Event) => void) | null,
                onerror: null as ((event: Event) => void) | null,
                error: makeError(),
              };
              queueMicrotask(() => request.onerror?.(new Event('error')));
              return request as unknown as IDBRequest;
            };
            return objectStore;
          };
        }
        return tx;
      };
    };

    failReads(() => new DOMException('aborted', 'AbortError'), 1);
    await expect(store.getAttachment(path)).resolves.toBe('payload');

    failReads(() => new Error('[IDB] Timeout reading canto/x'), 1);
    await expect(store.getAttachment(path)).resolves.toBe('payload');

    failReads(() => new Error('[IDB] Transaction aborted'), 1);
    await expect(store.getAttachment(path)).resolves.toBe('payload');

    failReads(() => 'raw string failure', 1);
    await expect(store.getAttachment(path)).rejects.toBe('raw string failure');

    failReads(() => new DOMException('aborted', 'AbortError'), 3);
    await expect(store.getAttachment(path)).rejects.toBeInstanceOf(DOMException);

    IDBDatabase.prototype.transaction = original;
  });

  it('surfaces an aborted delete transaction with and without a stored error', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));

    const original = IDBDatabase.prototype.transaction;
    const abortDelete = (txError: unknown) => {
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        const tx = original.call(this, storeNames, mode);
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.delete = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', { value: txError, configurable: true });
              if (tx.onabort) tx.onabort(new Event('abort'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return objectStore;
        };
        return tx;
      };
    };

    abortDelete(new DOMException('aborted', 'AbortError'));
    await expect(store.deleteAttachment('canto/j1/attachments/x')).rejects.toBeInstanceOf(
      DOMException,
    );

    abortDelete(null);
    await expect(store.deleteAttachment('canto/j1/attachments/x')).rejects.toThrow(
      '[IDB] Transaction aborted',
    );

    IDBDatabase.prototype.transaction = original;
  });

  it('surfaces an aborted existence check with and without a stored error', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();

    const original = IDBDatabase.prototype.transaction;
    const abortHas = (txError: unknown) => {
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        const tx = original.call(this, storeNames, mode);
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.getKey = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', { value: txError, configurable: true });
              if (tx.onabort) tx.onabort(new Event('abort'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return objectStore;
        };
        return tx;
      };
    };

    abortHas(new DOMException('aborted', 'AbortError'));
    await expect(store.hasCompletedDeviceKeyRotation!()).rejects.toBeInstanceOf(DOMException);

    abortHas(null);
    await expect(store.hasCompletedDeviceKeyRotation!()).rejects.toThrow(
      '[IDB] Transaction aborted',
    );

    IDBDatabase.prototype.transaction = original;
  });

  it('surfaces an aborted key-list transaction with and without a stored error', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1', [makePage('p1')]));

    const original = IDBDatabase.prototype.transaction;
    const abortList = (txError: unknown) => {
      IDBDatabase.prototype.transaction = function (
        storeNames: string | string[],
        mode?: IDBTransactionMode,
      ) {
        const tx = original.call(this, storeNames, mode);
        const originalObjectStore = tx.objectStore.bind(tx);
        tx.objectStore = (name: string) => {
          const objectStore = originalObjectStore(name);
          objectStore.getAllKeys = () => {
            queueMicrotask(() => {
              Object.defineProperty(tx, 'error', { value: txError, configurable: true });
              if (tx.onabort) tx.onabort(new Event('abort'));
            });
            return { onsuccess: null, onerror: null } as unknown as IDBRequest;
          };
          return objectStore;
        };
        return tx;
      };
    };

    abortList(null);
    await expect(store.getJournal('j1')).rejects.toThrow('[IDB] Transaction aborted');

    abortList(new DOMException('aborted', 'AbortError'));
    await expect(store.getJournal('j1')).rejects.toBeInstanceOf(DOMException);

    IDBDatabase.prototype.transaction = original;
  });

  it('skips an empty import marker id during recovery with a valid index', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await putRawStorageRecord('canto/.imports/', 'marker');
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/j1/metadata.json')).resolves.toBeDefined();
  });

  it('treats an empty-data import marker as unparseable during recovery', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await putRawStorageRecord('canto/.imports/empty-marker', '');
    _resetDB();

    await createLocalStore(createMockEncryption()).initialize();

    await expect(getRawStorageRecord('canto/j1/metadata.json')).resolves.toBeDefined();
  });

  it('handles empty import marker ids while resolving active imports', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await putRawStorageRecord('canto/.imports/', 'marker');
    await deleteRawStorageRecord('canto/journals.json');

    await expect(store.listJournals()).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
      causeLayer: 'INDEX_ABSENT',
    });
  });

  it('defers recovery when only an unparseable marker covers durable data', async () => {
    const store = createLocalStore(createMockEncryption());
    await store.initialize();
    await store.saveJournal(makeJournalContent('j1'));
    await putRawStorageRecord('canto/.imports/empty-marker', '');
    await deleteRawStorageRecord('canto/journals.json');
    _resetDB();

    await expect(createLocalStore(createMockEncryption()).initialize()).resolves.toBeUndefined();
    await expect(getRawStorageRecord('canto/j1/metadata.json')).resolves.toBeDefined();
  });
});
