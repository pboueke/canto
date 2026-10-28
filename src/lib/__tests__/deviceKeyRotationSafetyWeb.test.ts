/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Web (IndexedDB) parity for plan 21 Part B: safe device-key rotation,
 * legacy zero-key recovery, strict key verification, diagnostics, and drafts.
 */
import 'fake-indexeddb/auto';
import * as SecureStore from 'expo-secure-store';
import type { JournalContent, Page } from 'canto-data';
import { createLocalStore, _resetDB } from '../storage/local.web';
import { createEncryptionService } from '@/lib/encryption';
import * as custody from '@/lib/encryption/device';
import { recoverKeyRotation, _resetKeyCreationPromise } from '@/lib/encryption/device';
import { aesGcmDecrypt, aesGcmEncrypt } from '@/lib/encryption/utils';
import { deriveKey } from '@/lib/encryption/password';
import { createPageCatalog } from '@/lib/journal-overview';
import { chunkedContentForBase64 } from '@/lib/storage/attachment-content';
import { ensureDeviceKeyBootstrap } from '@/lib/storage/bootstrap';
import type { DeviceKeyCustody } from '@/lib/storage/device-key-rotation';
import { DraftsPendingError, RotationInterruptedError } from '@/lib/storage/integrity';

const CURRENT = 'canto_device_encryption_key';
const PREVIOUS = 'canto_device_encryption_previous_key';
const ZERO = new Uint8Array(32);
const realCustody: DeviceKeyCustody = custody;

function journal(id: string, pages: Page[], secure = false): JournalContent {
  return {
    id,
    title: `Title ${id}`,
    icon: 'book',
    date: '2026-01-01T00:00:00Z',
    secure,
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
  } as any;
}

function page(id: string, extra: Partial<Page> = {}): Page {
  return {
    id,
    text: `secret text ${id}`,
    date: '2026-03-12T10:00:00Z',
    tags: [],
    files: [],
    images: [],
    comments: [],
    modified: 1,
    deleted: false,
    ...extra,
  } as any;
}

async function startup() {
  _resetKeyCreationPromise();
  _resetDB();
  const enc = createEncryptionService();
  const store = createLocalStore(enc);
  await ensureDeviceKeyBootstrap(store);
  await store.initialize();
  const completed = await store.hasCompletedDeviceKeyRotation!();
  await recoverKeyRotation(completed);
  if (completed) await store.clearCompletedDeviceKeyRotation!();
  enc.clearSession();
  return { enc, store };
}

async function rawPut(path: string, data: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ path, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function rawGet(path: string): Promise<string | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const value = await new Promise<any>((resolve, reject) => {
    const request = db.transaction('files', 'readonly').objectStore('files').get(path);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value?.data;
}

async function rawKeys(): Promise<string[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('canto');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = db.transaction('files', 'readonly').objectStore('files').getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return keys.map(String);
}

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));
}

beforeEach(async () => {
  _resetDB();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('canto');
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
  (globalThis as any).__secureStoreClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (globalThis.navigator as any).storage;
});

async function seedLibrary() {
  const { enc, store } = await startup();
  await store.saveJournal(journal('j1', [page('p1'), page('p2')]));
  await store.saveJournal(journal('j2', [page('q1')]));
  return { enc, store };
}

async function expectLibraryReadable(store: any) {
  expect((await store.listJournals()).map((entry: any) => entry.id).sort()).toEqual(['j1', 'j2']);
  expect((await store.getJournal('j1'))!.pages).toHaveLength(2);
  expect((await store.getJournal('j2'))!.pages).toHaveLength(1);
}

describe('web rotateDeviceKey', () => {
  it('rotates every record and discards the old key', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    const progress: number[] = [];
    await store.rotateDeviceKey!(realCustody, (current) => progress.push(current));
    expect(progress).toEqual([1, 2]);
    const newHex = (await SecureStore.getItemAsync(CURRENT))!;
    expect(newHex).not.toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect((await rawKeys()).some((key) => key.includes('/.transactions/'))).toBe(false);
    await expect(
      aesGcmDecrypt((await rawGet('canto/j1/pages/p1.json'))!, hex(newHex)),
    ).resolves.toContain('secret text p1');
    await expectLibraryReadable((await startup()).store);
  });

  it('keeps both keys and finishes on restart when apply fails after the commit point', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    const put = IDBObjectStore.prototype.put;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: any,
      key?: IDBValidKey,
    ) {
      if (value?.path === 'canto/j2/pages/q1.json') {
        throw new DOMException('simulated quota failure', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBe(oldHex);
    await expect(store.savePage('j1', page('p9'))).rejects.toBeInstanceOf(RotationInterruptedError);
    spy.mockRestore();
    const next = await startup();
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable(next.store);
  });

  it('rolls back to the old key when the commit marker write fails', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    const put = IDBObjectStore.prototype.put;
    jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: any,
      key?: IDBValidKey,
    ) {
      if (String(value?.path).endsWith('/marker') && String(value?.data).includes('committing')) {
        throw new DOMException('simulated failure', 'UnknownError');
      }
      return put.call(this, value, key);
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toThrow('simulated failure');
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect((await rawKeys()).some((key) => key.includes('/.transactions/'))).toBe(false);
    await expectLibraryReadable(store);
  });

  it('refuses unindexed data, pending imports, pending transactions, and unreadable data', async () => {
    const { enc, store } = await seedLibrary();
    await rawPut('canto/orphan/pages/o1.json', await enc.encrypt('{}'));
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNRECOVERED_DATA',
    });

    const fresh = await seedLibrary();
    await fresh.store.beginJournalImport!('incoming');
    await expect(fresh.store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNRECOVERED_DATA',
    });
  });

  it('refuses a pending transaction, an unreadable record, and an unreadable index', async () => {
    const { store } = await seedLibrary();
    await rawPut('canto/.transactions/page-x/marker', '{"phase":"prepared"}');
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'ROTATION_PENDING',
    });

    const second = await seedLibrary();
    await rawPut('canto/j1/pages/p1.json', 'not-a-ciphertext');
    await expect(second.store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });

    const third = await seedLibrary();
    await rawPut('canto/journals.json', 'garbage');
    await expect(third.store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });
  });

  it('refuses an oversized legacy attachment and insufficient quota', async () => {
    const { store } = await seedLibrary();
    (globalThis.navigator as any).storage = {
      estimate: async () => ({ quota: 1000, usage: 900 }),
    };
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'INSUFFICIENT_SPACE',
    });
    (globalThis.navigator as any).storage = {
      estimate: async () => {
        throw new Error('unavailable');
      },
    };
    await rawPut('canto/j1/attachments/legacy.bin', 'x');
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNSUPPORTED_DATA',
    });
  });

  it('makes a writer queued during rotation write under the new key', async () => {
    const { store } = await seedLibrary();
    let queued: Promise<void> | null = null;
    await store.rotateDeviceKey!({
      ...realCustody,
      prepareKeyRotation: async () => {
        queued = store.savePage('j1', page('p3'));
        return realCustody.prepareKeyRotation();
      },
    });
    await queued;
    const newHex = (await SecureStore.getItemAsync(CURRENT))!;
    await expect(
      aesGcmDecrypt((await rawGet('canto/j1/pages/p3.json'))!, hex(newHex)),
    ).resolves.toContain('p3');
    expect((await (await startup()).store.getJournal('j1'))!.pages).toHaveLength(3);
  });
});

describe('web legacy zero-key recovery', () => {
  async function seedZeroKeyJournal() {
    const { enc, store } = await startup();
    const salt = new Uint8Array(16).fill(7);
    const realKey = await deriveKey('correct horse', salt, 1000);
    const wrongKey = await deriveKey('wrong horse', salt, 1000);
    await store.saveJournal(journal('s1', [page('p1'), page('p2')], true) as any, realKey);
    const edited = page('p2', {
      text: 'edited after auto-lock',
      images: [
        {
          id: 'img',
          name: 'pic.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: 'canto/s1/attachments/eimg-p2-1.jpg',
        } as any,
      ],
    });
    await rawPut(
      'canto/s1/attachments/eimg-p2-1.jpg',
      await enc.encrypt(await aesGcmEncrypt('cGljdHVyZQ==', ZERO)),
    );
    await rawPut(
      'canto/s1/pages/p2.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(edited), ZERO)),
    );
    await rawPut(
      'canto/s1/page-catalog.json',
      await enc.encrypt(
        await aesGcmEncrypt(JSON.stringify(createPageCatalog('s1', [edited])), ZERO),
      ),
    );
    return { enc, store, realKey, wrongKey };
  }

  it('verifies the password strictly and recovers the zero-key records', async () => {
    const { enc, store, realKey, wrongKey } = await seedZeroKeyJournal();
    expect(await store.verifyJournalKey!('s1', realKey)).toBe('valid');
    expect(await store.verifyJournalKey!('s1', wrongKey)).toBe('invalid');
    await expect(store.getJournalOverview!('s1', realKey)).rejects.toMatchObject({
      code: 'LEGACY_ZERO_KEY',
    });
    await expect(store.getJournalOverview!('s1', wrongKey)).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
    expect((await store.scanJournalPages!('s1', realKey)).legacyPageCount).toBe(1);
    await expect(store.restoreJournalCatalog!('s1', wrongKey)).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
    });

    await store.restoreJournalCatalog!('s1', realKey);
    expect((await store.getJournalOverview!('s1', realKey))!.pages).toHaveLength(2);
    expect(await store.getAttachment('canto/s1/attachments/eimg-p2-1.jpg', realKey)).toBe(
      'cGljdHVyZQ==',
    );
    const device = await enc.decrypt((await rawGet('canto/s1/pages/p2.json'))!);
    await expect(aesGcmDecrypt(device, ZERO)).rejects.toThrow();
  });

  it('recovers zero-key metadata and chunk frames', async () => {
    const { enc, store, realKey } = await seedZeroKeyJournal();
    const metadata = JSON.parse(
      await aesGcmDecrypt(await enc.decrypt((await rawGet('canto/s1/metadata.json'))!), realKey),
    );
    await rawPut(
      'canto/s1/metadata.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(metadata), ZERO)),
    );
    const chunked = page('p3', {
      files: [
        {
          id: 'f',
          name: 'doc.bin',
          type: 'file',
          encrypted: true,
          deleted: false,
          path: 'canto/s1/attachments/chunk-v1-p3-f-g',
          content: chunkedContentForBase64('ZnJhbWU='),
        } as any,
      ],
    });
    await rawPut(
      'canto/s1/attachments/chunk-v1-p3-f-g/0',
      await enc.encrypt(await aesGcmEncrypt('frame', ZERO)),
    );
    await rawPut(
      'canto/s1/pages/p3.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(chunked), ZERO)),
    );
    await expect(store.getJournalOverview!('s1', realKey)).rejects.toMatchObject({
      code: 'LEGACY_ZERO_KEY',
    });
    expect((await store.restoreJournalCatalog!('s1', realKey)).legacyPageCount).toBe(2);
    expect((await store.getJournalOverview!('s1', realKey))!.metadata.title).toBe('Title s1');
    const frame = await enc.decrypt((await rawGet('canto/s1/attachments/chunk-v1-p3-f-g/0'))!);
    await expect(aesGcmDecrypt(frame, realKey)).resolves.toBe('frame');
  });

  it('refuses to re-encrypt when nothing proves the key', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('any', new Uint8Array(16).fill(1), 1000);
    await store.saveJournal(journal('z1', [], true) as any, key);
    const metadata = JSON.parse(
      await aesGcmDecrypt(await enc.decrypt((await rawGet('canto/z1/metadata.json'))!), key),
    );
    for (const [path, value] of [
      ['canto/z1/metadata.json', JSON.stringify(metadata)],
      ['canto/z1/pages/p1.json', JSON.stringify(page('p1'))],
      ['canto/z1/page-catalog.json', JSON.stringify(createPageCatalog('z1', [page('p1')]))],
    ] as const) {
      await rawPut(path, await enc.encrypt(await aesGcmEncrypt(value, ZERO)));
    }
    await expect(store.restoreJournalCatalog!('z1', key)).rejects.toMatchObject({
      code: 'KEY_UNVERIFIABLE',
    });
  });

  it('throws typed errors for missing or device-unreadable metadata', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16), 1000);
    await expect(store.verifyJournalKey!('missing', key)).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
      causeLayer: 'MISSING_PAGE_FILE',
    });
    await store.saveJournal(journal('bad', []));
    await rawPut('canto/bad/metadata.json', 'garbage');
    await expect(store.verifyJournalKey!('bad', key)).rejects.toMatchObject({
      causeLayer: 'DEVICE_DECRYPT_FAILED',
    });
  });
});

describe('web diagnostics and drafts', () => {
  it('reports counts only', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(9), 1000);
    await store.saveJournal(journal('d1', [page('p1'), page('p2')], true) as any, key);
    await rawPut(
      'canto/d1/pages/p2.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(page('p2')), ZERO)),
    );
    await rawPut('canto/orphan/metadata.json', await enc.encrypt('{}'));
    await rawPut('canto/.transactions/t1/marker', '{}');
    await rawPut('canto/.imports/i1', '{}');
    await store.saveDraft!('d1', page('p1'), key);
    const diagnostics = await store.collectDiagnostics!('d1', key);
    expect(diagnostics).toMatchObject({
      platform: 'web',
      index: 'valid',
      indexedJournals: 1,
      unindexedJournalDirectories: 1,
      pendingTransactions: 1,
      pendingImports: 1,
      journal: { keySupplied: true, drafts: 1, pages: { total: 2, real: 1, legacyZero: 1 } },
    });
    const text = JSON.stringify(diagnostics);
    for (const secret of ['secret text', 'Title d1', 'p1', 'canto/']) {
      expect(text).not.toContain(secret);
    }
    expect((await store.collectDiagnostics!()).journal).toBeUndefined();
    expect((await store.collectDiagnostics!('none', ZERO)).journal).toMatchObject({
      keySupplied: false,
      metadata: { total: 0 },
      catalog: { total: 0 },
    });
  });

  it('round-trips, hides, and removes drafts', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(5), 1000);
    const wrong = await deriveKey('no', new Uint8Array(16).fill(5), 1000);
    await store.saveJournal(journal('s', [page('p1')], true) as any, key);
    await expect(store.saveDraft!('s', page('p1'))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.saveDraft!('ghost', page('p1'))).rejects.toThrow('Journal not found');

    await store.saveDraft!('s', page('p1', { text: 'half a thought' }), key);
    expect((await store.getDraft!('s', 'p1', key))!.text).toBe('half a thought');
    expect(await store.getDraft!('s', 'p1', wrong)).toBeNull();
    expect(await store.getDraft!('s', 'missing', key)).toBeNull();
    expect(await store.listDrafts!('s')).toEqual(['p1']);
    expect((await store.getJournal('s', key))!.pages).toHaveLength(1);

    // A storage delete (also used by sync for remote deletions) keeps the
    // unsaved local draft; the editor discards it on a user delete.
    await store.deletePage('s', 'p1', key);
    expect(await store.listDrafts!('s')).toEqual(['p1']);
    await store.deleteDraft!('s', 'p1');

    await store.savePage('s', page('p2'), key);
    await store.saveDraft!('s', page('p2'), key);
    const next = await deriveKey('new', new Uint8Array(16).fill(6), 1000);
    const full = (await store.getJournal('s', key))!;
    await expect(store.reencryptJournal(full, key, next)).rejects.toBeInstanceOf(
      DraftsPendingError,
    );
    expect(await store.listDrafts!('s')).toEqual(['p2']);
    await store.deleteDraft!('s', 'p2');
    await store.reencryptJournal(full, key, next);

    await store.saveDraft!('s', page('p2'), next);
    await store.deleteDraft!('s', 'p2');
    expect(await store.listDrafts!('s')).toEqual([]);
  });
});

describe('web edge paths', () => {
  function failPut(match: (value: any) => boolean, message = 'simulated failure') {
    const put = IDBObjectStore.prototype.put;
    return jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: any,
      key?: IDBValidKey,
    ) {
      if (match(value)) throw new DOMException(message, 'UnknownError');
      return put.call(this, value, key);
    });
  }

  it('rotates an empty library and accepts a quota estimate without usage', async () => {
    const { store } = await startup();
    (globalThis.navigator as any).storage = { estimate: async () => ({ quota: 1e12 }) };
    await store.rotateDeviceKey!(realCustody);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
  });

  it('treats a silently lost record write as interrupted and repairs it on restart', async () => {
    const { store } = await seedLibrary();
    const put = IDBObjectStore.prototype.put;
    let dropped = false;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: any,
      key?: IDBValidKey,
    ) {
      if (!dropped && value?.path === 'canto/j1/pages/p1.json') {
        dropped = true;
        return put.call(this, { ...value, data: 'stale' }, key);
      }
      return put.call(this, value, key);
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    spy.mockRestore();
    await expectLibraryReadable((await startup()).store);
  });

  async function seedLegacy() {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(8), 1000);
    await store.saveJournal(journal('a1', [page('p1')], true) as any, key);
    const legacyPage = page('p2', {
      images: [
        {
          id: 'plain',
          name: 'p.jpg',
          type: 'image',
          encrypted: false,
          deleted: false,
          path: 'canto/a1/attachments/plain.jpg',
        },
        {
          id: 'real',
          name: 'r.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: 'canto/a1/attachments/real.jpg',
        },
        {
          id: 'bad',
          name: 'b.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: 'canto/a1/attachments/bad.jpg',
        },
      ],
    } as any);
    await rawPut('canto/a1/attachments/plain.jpg', await enc.encrypt('plain'));
    await rawPut(
      'canto/a1/attachments/real.jpg',
      await enc.encrypt(await aesGcmEncrypt('real', key)),
    );
    await rawPut('canto/a1/attachments/bad.jpg', 'not-device-ciphertext');
    await rawPut(
      'canto/a1/pages/p2.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(legacyPage), ZERO)),
    );
    return { store, key };
  }

  it('leaves non-legacy attachment payloads untouched during recovery', async () => {
    const { store, key } = await seedLegacy();
    const before = await Promise.all(
      ['plain', 'real', 'bad'].map((name) => rawGet(`canto/a1/attachments/${name}.jpg`)),
    );
    await store.restoreJournalCatalog!('a1', key);
    const after = await Promise.all(
      ['plain', 'real', 'bad'].map((name) => rawGet(`canto/a1/attachments/${name}.jpg`)),
    );
    expect(after).toEqual(before);
  });

  it('replays a recovery interrupted after its commit point', async () => {
    const { store, key } = await seedLegacy();
    const spy = failPut((value) => value?.path === 'canto/a1/page-catalog.json');
    await expect(store.restoreJournalCatalog!('a1', key)).rejects.toThrow('simulated failure');
    spy.mockRestore();
    expect((await (await startup()).store.getJournalOverview!('a1', key))!.pages).toHaveLength(2);
  });

  it('cleans up a recovery that fails before its commit point', async () => {
    const { store, key } = await seedLegacy();
    const spy = failPut(
      (value) =>
        String(value?.path).endsWith('/marker') && String(value?.data).includes('prepared'),
    );
    await expect(store.restoreJournalCatalog!('a1', key)).rejects.toThrow('simulated failure');
    spy.mockRestore();
    expect((await rawKeys()).some((path) => path.includes('/.transactions/'))).toBe(false);
  });

  it('reports diagnostics for an unreadable index and ignores non-page keys', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(2), 1000);
    await store.saveJournal(journal('n1', [page('p1')], true) as any, key);
    await rawPut('canto/n1/pages/p1.json.tmp', 'partial');
    expect(await store.verifyJournalKey!('n1', key)).toBe('valid');
    expect((await store.collectDiagnostics!('n1', key)).journal!.pages.total).toBe(1);
    await rawPut('canto/journals.json', 'garbage');
    const diagnostics = await store.collectDiagnostics!();
    expect(diagnostics).toMatchObject({ index: 'unreadable', indexedJournals: 0 });
  });
});

describe('web review follow-ups', () => {
  it('clears a stale completion marker before the next rotation can change keys', async () => {
    const { store } = await seedLibrary();
    await rawPut('canto/.device-key-rotation-complete', 'complete');
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    await expect(
      store.rotateDeviceKey!({
        ...realCustody,
        beginKeyRotation: async (oldKey, newKey) => {
          await realCustody.beginKeyRotation(oldKey, newKey);
          throw new Error('process killed');
        },
        abortKeyRotation: async () => {},
      }),
    ).rejects.toThrow('process killed');
    const next = await startup();
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    await expectLibraryReadable(next.store);
  });

  it('refuses when the stale marker cannot be cleared, and survives final cleanup failure', async () => {
    const { store } = await seedLibrary();
    await rawPut('canto/.device-key-rotation-complete', 'complete');
    const remove = IDBObjectStore.prototype.delete;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (key === 'canto/.device-key-rotation-complete') {
        throw new DOMException('denied', 'UnknownError');
      }
      return remove.call(this, key);
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'ROTATION_PENDING',
    });
    spy.mockRestore();

    await (
      await startup()
    ).store.clearCompletedDeviceKeyRotation!();
    const fresh = await startup();
    const failFinal = jest.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
      this: IDBObjectStore,
      key: IDBValidKey | IDBKeyRange,
    ) {
      if (key === 'canto/.device-key-rotation-complete') {
        throw new DOMException('denied', 'UnknownError');
      }
      return remove.call(this, key);
    });
    await fresh.store.rotateDeviceKey!(realCustody);
    failFinal.mockRestore();
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable((await startup()).store);
  });

  it('keeps the fallback key when the new key cannot open a rotated record', async () => {
    const { store } = await seedLibrary();
    await expect(
      store.rotateDeviceKey!({
        ...realCustody,
        beginKeyRotation: async (oldKey, newKey) => {
          await realCustody.beginKeyRotation(oldKey, newKey);
          for (const key of await rawKeys()) {
            if (/\/\.transactions\/device-[^/]+\/file-\d+$/.test(key)) {
              if ((await rawGet(key)) !== 'complete') await rawPut(key, 'corrupt-staging');
            }
          }
        },
      }),
    ).rejects.toBeInstanceOf(RotationInterruptedError);
    expect(await SecureStore.getItemAsync(PREVIOUS)).not.toBeNull();
  });
});

describe('web coverage of refusal paths', () => {
  it('rotates when the browser cannot estimate its quota', async () => {
    const { store } = await seedLibrary();
    (globalThis.navigator as any).storage = {
      estimate: async () => {
        throw new Error('unavailable');
      },
    };
    await store.rotateDeviceKey!(realCustody);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
  });

  it('refuses recovery with a key that opens no record', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('right', new Uint8Array(16).fill(4), 1000);
    const other = await deriveKey('wrong', new Uint8Array(16).fill(4), 1000);
    await store.saveJournal(journal('w1', [page('p1')], true) as any, key);
    await rawPut(
      'canto/w1/pages/p1.json',
      await enc.encrypt(await aesGcmEncrypt(JSON.stringify(page('p1')), ZERO)),
    );
    await expect(store.restoreJournalCatalog!('w1', other)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
  });
});

describe('web record id validation', () => {
  it('rejects ids that would nest under another record', async () => {
    const { store } = await seedLibrary();
    for (const bad of ['j1/pages', '..', '', 'a\\b']) {
      await expect(store.getJournal(bad)).rejects.toThrow('Invalid record id');
    }
    await expect(store.saveDraft!('j1', page('../x'))).rejects.toThrow('Invalid record id');
    await expect(store.deleteDraft!('j1', 'a/b')).rejects.toThrow('Invalid record id');
    await expectLibraryReadable(store);
  });

  it('skips an import marker with an unusable id at startup', async () => {
    await seedLibrary();
    await rawPut(
      'canto/.imports/..',
      JSON.stringify({ version: 2, journalId: '..', phase: 'prepared' }),
    );
    const warn = jest.spyOn(console, 'warn');
    await expectLibraryReadable((await startup()).store);
    expect(warn).toHaveBeenCalledWith('[Canto] Skipping an import marker with an unusable id');
  });
});

describe('web multi-tab rotation (cross-platform review)', () => {
  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: undefined });
    require('../storage/tab-coordination.web')._resetTabRegistration();
  });

  it('refuses to rotate while another tab holds the library open, changing nothing', async () => {
    const held: { name: string }[] = [{ name: 'canto-open-tab' }]; // the other tab
    Object.defineProperty(globalThis.navigator, 'locks', {
      configurable: true,
      value: {
        request: async (
          name: string,
          options: { mode: string },
          callback: () => Promise<unknown>,
        ) => {
          if (options.mode === 'shared') {
            held.push({ name });
            return new Promise(() => {});
          }
          return callback();
        },
        query: async () => ({ held: [...held] }),
      },
    });
    require('../storage/tab-coordination.web')._resetTabRegistration();
    const { store } = await seedLibrary();
    const oldHex = await localStorageKey();
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'OTHER_TABS_OPEN',
    });
    expect(await localStorageKey()).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable(store);
  });
});

function localStorageKey() {
  return SecureStore.getItemAsync(CURRENT);
}

describe('web superseded attachment cleanup', () => {
  it('finishes a password change even when old attachment roots cannot be removed', async () => {
    const { store } = await startup();
    const oldKey = await deriveKey('old', new Uint8Array(16).fill(2), 1000);
    const newKey = await deriveKey('new', new Uint8Array(16).fill(2), 1000);
    const attachment = {
      id: 'a',
      name: 'a.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      path: '',
      content: chunkedContentForBase64(Buffer.from('chunk').toString('base64')),
    } as any;
    await store.saveJournal(journal('pw', [page('p1')], true) as any, oldKey);
    attachment.path = await store.saveAttachment(
      'pw',
      'p1',
      attachment,
      Buffer.from('chunk').toString('base64'),
      oldKey,
    );
    await store.savePage('pw', page('p1', { files: [attachment] }), oldKey);
    const original = IDBObjectStore.prototype.openCursor;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (
      this: IDBObjectStore,
      ...args: any[]
    ) {
      const range = args[0] as IDBKeyRange | undefined;
      if (range && String((range as any).lower).includes('/chunk-v1-')) {
        throw new DOMException('busy', 'UnknownError');
      }
      return (original as any).apply(this, args);
    });
    const warn = jest.spyOn(console, 'warn');
    await store.reencryptJournal((await store.getJournal('pw', oldKey))!, oldKey, newKey);
    spy.mockRestore();
    expect((await store.getJournal('pw', newKey))!.pages[0].files).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      '[Canto] Superseded attachment cleanup deferred:',
      expect.anything(),
    );
  });
});

describe('web recovery with unreadable metadata', () => {
  it('rebuilds the page list without touching metadata it cannot read', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(4), 1000);
    await store.saveJournal(journal('um', [page('p1'), page('p2')], true) as any, key);
    await rawPut('canto/um/metadata.json', 'not-device-ciphertext');
    expect((await store.restoreJournalCatalog!('um', key)).pageCount).toBe(2);
    expect(await rawGet('canto/um/metadata.json')).toBe('not-device-ciphertext');
  });
});

describe('web rotation must cover every journal record', () => {
  it('refuses, changing nothing, if the key listing misses a journal record', async () => {
    const { store } = await seedLibrary();
    const oldHex = await SecureStore.getItemAsync(CURRENT);
    const getAllKeys = IDBObjectStore.prototype.getAllKeys;
    const spy = jest.spyOn(IDBObjectStore.prototype, 'getAllKeys').mockImplementation(function (
      this: IDBObjectStore,
      ...args: any[]
    ) {
      const real = (getAllKeys as any).apply(this, args) as IDBRequest<IDBValidKey[]>;
      const filtered: any = {};
      Object.defineProperty(filtered, 'result', {
        get: () => (real.result as string[]).filter((key) => key !== 'canto/j2/metadata.json'),
      });
      Object.defineProperty(filtered, 'error', { get: () => real.error });
      Object.defineProperty(filtered, 'onsuccess', {
        set: (handler: () => void) => {
          real.onsuccess = handler;
        },
      });
      Object.defineProperty(filtered, 'onerror', {
        set: (handler: () => void) => {
          real.onerror = handler;
        },
      });
      return filtered;
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });
    spy.mockRestore();
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable((await startup()).store);
  });
});
