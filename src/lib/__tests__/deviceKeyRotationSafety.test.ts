/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Regression coverage for plan 21 Part B: device-key rotation must never
 * discard a key that on-disk ciphertext still needs, and legacy zero-key
 * records must be recoverable with the verified journal key.
 *
 * Uses real AES-GCM (jest.setup expo-crypto mock) and the real SecureStore
 * mock so key custody behaves exactly like startup.
 */
import type { Attachment, JournalContent, Page } from 'canto-data';

const mockFs: Record<string, string> = {};
const mockFail: {
  match: string | null;
  /** Number of matching target writes allowed before failing. */
  after: number;
  count: number;
  /** Fail at most this many times (Infinity = persistent). */
  times: number;
  failed: number;
  /** Fail writes of transaction markers whose content matches this phase. */
  markerPhase: string | null;
  /** Silently drop (not store) the next write to a target containing this text. */
  drop: string | null;
} = {
  match: null,
  after: 0,
  count: 0,
  times: Infinity,
  failed: 0,
  markerPhase: null,
  drop: null,
};

// Mirrors expo-file-system on Android: a Directory's uri always ends with
// '/', and joining never produces double slashes. Code that builds paths by
// appending '/' to a directory uri must work against this.
jest.mock('expo-file-system', () => {
  const join = (parts: any[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : p.uri))
      .join('/')
      .replace(/\/{2,}/g, '/');
  class MockFile {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = join(parts).replace(/\/$/, '');
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
    get exists() {
      return this.uri in mockFs;
    }
    get size() {
      return Buffer.byteLength(mockFs[this.uri] ?? '', 'utf8');
    }
    create() {
      if (!(this.uri in mockFs)) mockFs[this.uri] = '';
    }
    write(content: string) {
      if (
        mockFail.drop &&
        this.uri.includes(mockFail.drop) &&
        !this.uri.includes('/.transactions/')
      ) {
        mockFail.drop = null;
        return;
      }
      if (
        mockFail.markerPhase &&
        this.uri.endsWith('/marker.json') &&
        content.includes(`"phase":"${mockFail.markerPhase}"`)
      ) {
        mockFail.markerPhase = null;
        throw new Error('EIO: simulated marker write failure');
      }
      if (
        mockFail.match &&
        this.uri.includes(mockFail.match) &&
        !this.uri.includes('/.transactions/') &&
        mockFail.failed < mockFail.times
      ) {
        mockFail.count++;
        if (mockFail.count > mockFail.after) {
          mockFail.failed++;
          throw new Error('EIO: simulated write failure');
        }
      }
      mockFs[this.uri] = content;
    }
    text() {
      return Promise.resolve(mockFs[this.uri] ?? '');
    }
    delete() {
      delete mockFs[this.uri];
    }
    move(target: any) {
      mockFs[target.uri] = mockFs[this.uri];
      delete mockFs[this.uri];
    }
  }
  class MockDirectory {
    uri: string;
    constructor(...parts: any[]) {
      const joined = join(parts);
      this.uri = joined.endsWith('/') ? joined : `${joined}/`;
    }
    get name() {
      return this.uri.replace(/\/$/, '').split('/').pop() ?? '';
    }
    get exists() {
      return Object.keys(mockFs).some((key) => key.startsWith(this.uri));
    }
    create() {}
    list() {
      const prefix = this.uri;
      const out: any[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(mockFs)) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) out.push(new MockFile(key));
        else {
          const dir = prefix + rest.split('/')[0];
          if (!seen.has(dir)) {
            seen.add(dir);
            out.push(new MockDirectory(dir));
          }
        }
      }
      return out;
    }
    delete() {
      for (const key of Object.keys(mockFs)) if (key.startsWith(this.uri)) delete mockFs[key];
    }
  }
  return {
    Paths: { document: { uri: '/mock-docs/' } },
    File: MockFile,
    Directory: MockDirectory,
  };
});

import * as SecureStore from 'expo-secure-store';
import { Paths } from 'expo-file-system';
import { createEncryptionService } from '@/lib/encryption';
import { createLocalStore } from '@/lib/storage/local';
import { ensureDeviceKeyBootstrap } from '@/lib/storage/bootstrap';
import * as custody from '@/lib/encryption/device';
import { recoverKeyRotation, _resetKeyCreationPromise } from '@/lib/encryption/device';
import { aesGcmDecrypt, aesGcmEncrypt } from '@/lib/encryption/utils';
import { deriveKey } from '@/lib/encryption/password';
import { createPageCatalog } from '@/lib/journal-overview';
import {
  ATTACHMENT_CHUNK_SIZE,
  chunkedContentForByteLength,
} from '@/lib/storage/attachment-content';
import { RotationBlockedError, type DeviceKeyCustody } from '@/lib/storage/device-key-rotation';
import {
  DraftsPendingError,
  RotationInterruptedError,
  StorageIntegrityError,
} from '@/lib/storage/integrity';

const CURRENT = 'canto_device_encryption_key';
const PREVIOUS = 'canto_device_encryption_previous_key';
const ZERO = new Uint8Array(32);

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

/** Same sequence as useStorage.ensureInitialized. */
async function startup() {
  _resetKeyCreationPromise();
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

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)!.map((byte) => parseInt(byte, 16)));
}

const realCustody: DeviceKeyCustody = custody;

beforeEach(() => {
  for (const key of Object.keys(mockFs)) delete mockFs[key];
  (globalThis as any).__secureStoreClear();
  Object.assign(mockFail, {
    match: null,
    after: 0,
    count: 0,
    times: Infinity,
    failed: 0,
    markerPhase: null,
    drop: null,
  });
  delete (Paths as any).availableDiskSpace;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function seedLibrary() {
  const { enc, store } = await startup();
  await store.saveJournal(journal('j1', [page('p1'), page('p2')]));
  await store.saveJournal(journal('j2', [page('q1')]));
  return { enc, store };
}

async function expectLibraryReadable(store: any) {
  const journals = await store.listJournals();
  expect(journals.map((entry: any) => entry.id).sort()).toEqual(['j1', 'j2']);
  expect((await store.getJournal('j1'))!.pages).toHaveLength(2);
  expect((await store.getJournal('j2'))!.pages).toHaveLength(1);
}

describe('rotateDeviceKey', () => {
  it('rotates every record, discards the old key, and survives restart', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    await store.rotateDeviceKey!(realCustody);
    const newHex = (await SecureStore.getItemAsync(CURRENT))!;
    expect(newHex).not.toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(await store.hasCompletedDeviceKeyRotation!()).toBe(false);
    expect(Object.keys(mockFs).some((key) => key.includes('/.transactions/'))).toBe(false);
    // Every journal record now opens with the new key alone.
    for (const [path, value] of Object.entries(mockFs)) {
      if (path.includes('/j1/') || path.includes('/j2/') || path.endsWith('journals.json')) {
        await expect(aesGcmDecrypt(value, hex(newHex))).resolves.toBeDefined();
      }
    }
    await expectLibraryReadable(store);
    await expectLibraryReadable((await startup()).store);
  });

  it('reports progress per journal', async () => {
    const { store } = await seedLibrary();
    const progress: [number, number][] = [];
    await store.rotateDeviceKey!(realCustody, (current, total) => progress.push([current, total]));
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  // Repro A (plan 21 B.1.3): an apply failure after the commit point used to
  // abort the key cutover, deleting the only key that could read the
  // already-published new ciphertext.
  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    'keeps both keys and finishes on restart when apply fails persistently at target %i',
    async (failAt) => {
      const { store } = await seedLibrary();
      const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
      Object.assign(mockFail, { match: '/mock-docs/canto/', after: failAt });
      await expect(store.rotateDeviceKey!(realCustody)).rejects.toBeInstanceOf(
        RotationInterruptedError,
      );
      expect(await SecureStore.getItemAsync(PREVIOUS)).toBe(oldHex);
      expect(await SecureStore.getItemAsync(CURRENT)).not.toBe(oldHex);
      // Writes are refused until restart so the replay cannot overwrite them.
      await expect(store.savePage('j1', page('p9'))).rejects.toBeInstanceOf(
        RotationInterruptedError,
      );
      // Reads still work across the mixed old/new view.
      expect((await store.listJournals()).length).toBe(2);

      mockFail.match = null;
      const next = await startup();
      expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
      await expectLibraryReadable(next.store);
      await next.store.savePage('j1', page('p3'));
      expect((await next.store.getJournal('j1'))!.pages).toHaveLength(3);
    },
  );

  it('retries a transient apply failure in process and completes', async () => {
    const { store } = await seedLibrary();
    Object.assign(mockFail, { match: '/mock-docs/canto/', after: 2, times: 1 });
    await store.rotateDeviceKey!(realCustody);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable(store);
    await expectLibraryReadable((await startup()).store);
  });

  it('rolls back to the old key when the commit marker never becomes durable', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    const before = { ...mockFs };
    mockFail.markerPhase = 'committing';
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toThrow('simulated marker');
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(mockFs).toEqual(before);
    await expectLibraryReadable(store);
    await expectLibraryReadable((await startup()).store);
  });

  it('keeps both keys when the commit marker write fails after it became durable', async () => {
    const { store } = await seedLibrary();
    const marker = jest.spyOn(require('expo-file-system').File.prototype, 'write');
    marker.mockImplementation(function (this: any, content: unknown) {
      mockFs[this.uri] = content as string;
      if (this.uri.endsWith('/marker.json') && String(content).includes('"committing"')) {
        throw new Error('EIO: reported failure after a durable write');
      }
    });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    marker.mockRestore();
    expect(await SecureStore.getItemAsync(PREVIOUS)).not.toBeNull();
    const next = await startup();
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable(next.store);
  });

  it('defers fallback cleanup to startup when the final key commit fails', async () => {
    const { store } = await seedLibrary();
    const failing: DeviceKeyCustody = {
      ...realCustody,
      commitKeyRotation: jest.fn(async () => {
        throw new Error('SecureStore unavailable');
      }),
    };
    await store.rotateDeviceKey!(failing);
    expect(await SecureStore.getItemAsync(PREVIOUS)).not.toBeNull();
    expect(await store.hasCompletedDeviceKeyRotation!()).toBe(true);
    // New writes are not sealed: the data is already rotated and verified.
    await store.savePage('j1', page('p3'));
    const next = await startup();
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect((await next.store.getJournal('j1'))!.pages).toHaveLength(3);
  });

  it('restores the old key when the durable key cutover itself fails', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    const failing: DeviceKeyCustody = {
      ...realCustody,
      beginKeyRotation: jest.fn(async (oldKey: Uint8Array) => {
        await SecureStore.setItemAsync(PREVIOUS, Buffer.from(oldKey).toString('hex'));
        throw new Error('SecureStore write failed');
      }),
    };
    await expect(store.rotateDeviceKey!(failing)).rejects.toThrow('SecureStore write failed');
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(Object.keys(mockFs).some((key) => key.includes('/.transactions/'))).toBe(false);
    await expectLibraryReadable(store);
  });

  // Repro B: journal data outside the index used to stay on the retired key.
  it('refuses to rotate while unindexed journal data exists', async () => {
    const { enc, store } = await seedLibrary();
    mockFs['/mock-docs/canto/orphan/pages/o1.json'] = await enc.encrypt(JSON.stringify(page('o1')));
    const before = { ...mockFs };
    const oldHex = await SecureStore.getItemAsync(CURRENT);
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNRECOVERED_DATA',
    });
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(mockFs).toEqual(before);
  });

  it('refuses to rotate while an import is pending', async () => {
    const { store } = await seedLibrary();
    await store.beginJournalImport!('incoming');
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNRECOVERED_DATA',
    });
  });

  it('refuses to rotate while a storage transaction is pending', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/.transactions/page-x/marker.json'] = '{"phase":"prepared"}';
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'ROTATION_PENDING',
    });
  });

  it('refuses to start while a previous rotation still holds the fallback key', async () => {
    const { store } = await seedLibrary();
    await SecureStore.setItemAsync(PREVIOUS, 'ab'.repeat(32));
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'ROTATION_PENDING',
    });
  });

  it('refuses to rotate without enough free storage for the staged copy', async () => {
    const { store } = await seedLibrary();
    (Paths as any).availableDiskSpace = 1024;
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'INSUFFICIENT_SPACE',
    });
    (Paths as any).availableDiskSpace = 1024 * 1024 * 1024;
    await store.rotateDeviceKey!(realCustody);
  });

  it('refuses to rotate an oversized legacy attachment', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/j1/attachments/big.bin'] = 'x'.repeat(33 * 1024 * 1024);
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNSUPPORTED_DATA',
    });
  });

  it('refuses to rotate when the index cannot be read', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/journals.json'] = 'garbage';
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });
  });

  it('refuses without changing anything when a record cannot be decrypted', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/j1/pages/p1.json'] = 'not-a-ciphertext';
    const before = { ...mockFs };
    const oldHex = await SecureStore.getItemAsync(CURRENT);
    const error = await store.rotateDeviceKey!(realCustody).catch((caught) => caught);
    expect(error).toBeInstanceOf(RotationBlockedError);
    expect(error.reason).toBe('UNREADABLE_DATA');
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(mockFs).toEqual(before);
  });

  // Repro C: a writer queued behind the rotation used the stale cached key.
  it('makes a writer queued during rotation write under the new key', async () => {
    const { store } = await seedLibrary();
    const att: Attachment = {
      id: 'a1',
      path: '',
      name: 'photo.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
    } as any;
    let queued: Promise<string> | null = null;
    const watching: DeviceKeyCustody = {
      ...realCustody,
      prepareKeyRotation: async () => {
        queued = store.saveAttachment('j1', 'p1', att, 'aW1hZ2VkYXRh');
        return realCustody.prepareKeyRotation();
      },
    };
    await store.rotateDeviceKey!(watching);
    const path = await queued!;
    const newHex = (await SecureStore.getItemAsync(CURRENT))!;
    await expect(aesGcmDecrypt(mockFs[path], hex(newHex))).resolves.toBe('aW1hZ2VkYXRh');
    const next = await startup();
    expect(await next.store.getAttachment(path)).toBe('aW1hZ2VkYXRh');
  });

  it('rotates draft records with their journal', async () => {
    const { store } = await seedLibrary();
    await store.saveDraft!('j1', page('p1', { text: 'unsaved words' }));
    await store.rotateDeviceKey!(realCustody);
    const next = await startup();
    expect((await next.store.getDraft!('j1', 'p1'))!.text).toBe('unsaved words');
  });
});

describe('legacy zero-key journals (repro D)', () => {
  async function seedZeroKeyJournal() {
    const { enc, store } = await startup();
    const salt = new Uint8Array(16).fill(7);
    const realKey = await deriveKey('correct horse', salt, 1000);
    const wrongKey = await deriveKey('wrong horse', salt, 1000);
    await store.saveJournal(
      journal('s1', [page('p1'), page('p2'), page('p3')], true) as any,
      realKey,
    );
    // What <= 0.20.0 savePage did with an auto-locked (zeroed) key buffer.
    const edited = page('p2', {
      text: 'edited after auto-lock',
      modified: 2,
      images: [
        {
          id: 'img',
          name: 'pic.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: '/mock-docs/canto/s1/attachments/eimg-p2-1.jpg',
        } as any,
      ],
    });
    mockFs['/mock-docs/canto/s1/attachments/eimg-p2-1.jpg'] = await enc.encrypt(
      await aesGcmEncrypt('cGljdHVyZQ==', ZERO),
    );
    mockFs['/mock-docs/canto/s1/pages/p2.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(edited), ZERO),
    );
    mockFs['/mock-docs/canto/s1/page-catalog.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(createPageCatalog('s1', [edited])), ZERO),
    );
    return { enc, store, realKey, wrongKey };
  }

  it('distinguishes the correct password from a wrong one', async () => {
    const { store, realKey, wrongKey } = await seedZeroKeyJournal();
    expect(await store.verifyJournalKey!('s1', realKey)).toBe('valid');
    expect(await store.verifyJournalKey!('s1', wrongKey)).toBe('invalid');
    expect(await store.verifyJournalKey!('s1', ZERO)).toBe('invalid');
  });

  it('reports LEGACY_ZERO_KEY instead of an unreadable catalog for the correct key', async () => {
    const { store, realKey } = await seedZeroKeyJournal();
    const error = await store.getJournalOverview!('s1', realKey).catch((caught) => caught);
    expect(error).toBeInstanceOf(StorageIntegrityError);
    expect(error.code).toBe('LEGACY_ZERO_KEY');
    expect(error.details).toHaveLength(1);
    expect(JSON.stringify(error.details)).not.toContain('p2');
  });

  it('recovers the zero-key page and attachment with the verified key', async () => {
    const { enc, store, realKey } = await seedZeroKeyJournal();
    const scan = await store.scanJournalPages!('s1', realKey);
    expect(scan.pageCount).toBe(3);
    expect(scan.legacyPageCount).toBe(1);

    const restored = await store.restoreJournalCatalog!('s1', realKey);
    expect(restored.legacyPageCount).toBe(1);
    const overview = await store.getJournalOverview!('s1', realKey);
    expect(overview!.pages).toHaveLength(3);
    expect((await store.getPage('s1', 'p2', realKey))!.text).toBe('edited after auto-lock');
    const device = await enc.decrypt(mockFs['/mock-docs/canto/s1/pages/p2.json']);
    await expect(aesGcmDecrypt(device, ZERO)).rejects.toThrow();
    expect(
      await store.getAttachment('/mock-docs/canto/s1/attachments/eimg-p2-1.jpg', realKey),
    ).toBe('cGljdHVyZQ==');
    // Recovery is idempotent and the journal stays healthy after restart.
    expect((await store.restoreJournalCatalog!('s1', realKey)).legacyPageCount).toBe(0);
    expect((await (await startup()).store.getJournalOverview!('s1', realKey))!.pages).toHaveLength(
      3,
    );
  });

  it('does not change any record when recovery runs with a wrong key', async () => {
    const { store, wrongKey } = await seedZeroKeyJournal();
    const before = { ...mockFs };
    await expect(store.restoreJournalCatalog!('s1', wrongKey)).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
    });
    expect(mockFs).toEqual(before);
  });

  it('refuses to re-encrypt when no record proves the key', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('any', new Uint8Array(16).fill(1), 1000);
    await store.saveJournal(journal('z1', [], true) as any, key);
    const metadata = JSON.parse(
      await aesGcmDecrypt(await enc.decrypt(mockFs['/mock-docs/canto/z1/metadata.json']), key),
    );
    // Everything was written under the zeroed key: nothing proves any password.
    mockFs['/mock-docs/canto/z1/metadata.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(metadata), ZERO),
    );
    mockFs['/mock-docs/canto/z1/pages/p1.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(page('p1')), ZERO),
    );
    mockFs['/mock-docs/canto/z1/page-catalog.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(createPageCatalog('z1', [page('p1')])), ZERO),
    );
    expect(await store.verifyJournalKey!('z1', key)).toBe('unverifiable');
    const before = { ...mockFs };
    await expect(store.restoreJournalCatalog!('z1', key)).rejects.toMatchObject({
      code: 'KEY_UNVERIFIABLE',
    });
    expect(mockFs).toEqual(before);
  });

  it('recovers zero-key metadata when a page proves the key', async () => {
    const { enc, store, realKey } = await seedZeroKeyJournal();
    const metadata = JSON.parse(
      await aesGcmDecrypt(await enc.decrypt(mockFs['/mock-docs/canto/s1/metadata.json']), realKey),
    );
    mockFs['/mock-docs/canto/s1/metadata.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(metadata), ZERO),
    );
    expect(await store.verifyJournalKey!('s1', realKey)).toBe('valid');
    await expect(store.getJournalOverview!('s1', realKey)).rejects.toMatchObject({
      code: 'LEGACY_ZERO_KEY',
    });
    await store.restoreJournalCatalog!('s1', realKey);
    expect((await store.getJournalOverview!('s1', realKey))!.metadata.title).toBe('Title s1');
  });

  it('still rejects every write under the zero key', async () => {
    const { store } = await seedZeroKeyJournal();
    await expect(store.savePage('s1', page('p4'), ZERO)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.saveDraft!('s1', page('p4'), ZERO)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
  });

  it('reports a typed error for metadata a wrong key cannot open', async () => {
    const { store, wrongKey } = await seedZeroKeyJournal();
    await expect(store.getJournalOverview!('s1', wrongKey)).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
      causeLayer: 'PASSWORD_DECRYPT_FAILED',
    });
  });

  it('rotation neither causes nor fixes the zero-key state', async () => {
    const { store, realKey } = await seedZeroKeyJournal();
    await store.rotateDeviceKey!(realCustody);
    const next = await startup();
    await expect(next.store.getJournalOverview!('s1', realKey)).rejects.toMatchObject({
      code: 'LEGACY_ZERO_KEY',
    });
    await next.store.restoreJournalCatalog!('s1', realKey);
    expect((await next.store.getJournalOverview!('s1', realKey))!.pages).toHaveLength(3);
  });
});

describe('verifyJournalKey on legacy layouts', () => {
  it('accepts any key for a journal without password-layered records', async () => {
    const { store } = await startup();
    await store.saveJournal(journal('plain', [page('p1')]));
    const key = await deriveKey('', new Uint8Array(16), 1000);
    expect(await store.verifyJournalKey!('plain', key)).toBe('valid');
  });

  it('uses page records when metadata has no password layer', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(3), 1000);
    const other = await deriveKey('other', new Uint8Array(16).fill(3), 1000);
    await store.saveJournal(journal('mixed', []));
    mockFs['/mock-docs/canto/mixed/pages/p1.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(page('p1')), key),
    );
    expect(await store.verifyJournalKey!('mixed', key)).toBe('valid');
    expect(await store.verifyJournalKey!('mixed', other)).toBe('invalid');
  });

  it('rejects metadata that opens but belongs to another journal', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(3), 1000);
    await store.saveJournal(journal('a', [], true) as any, key);
    mockFs['/mock-docs/canto/a/metadata.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify({ id: 'b' }), key),
    );
    expect(await store.verifyJournalKey!('a', key)).toBe('invalid');
  });

  it('throws a typed error when metadata is missing or device-unreadable', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16), 1000);
    await expect(store.verifyJournalKey!('missing', key)).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
    });
    await store.saveJournal(journal('bad', []));
    mockFs['/mock-docs/canto/bad/metadata.json'] = 'garbage';
    await expect(store.verifyJournalKey!('bad', key)).rejects.toMatchObject({
      code: 'JOURNAL_UNREADABLE',
      causeLayer: 'DEVICE_DECRYPT_FAILED',
    });
  });
});

describe('collectDiagnostics', () => {
  it('reports counts only, never content, titles, ids, or paths', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(9), 1000);
    await store.saveJournal(journal('d1', [page('p1'), page('p2')], true) as any, key);
    mockFs['/mock-docs/canto/d1/pages/p2.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(page('p2')), ZERO),
    );
    mockFs['/mock-docs/canto/d1/pages/p3.json'] = 'garbage';
    mockFs['/mock-docs/canto/orphan/metadata.json'] = await enc.encrypt('{}');
    await store.saveDraft!('d1', page('p1'), key);

    const diagnostics = await store.collectDiagnostics!('d1', key);
    expect(diagnostics).toMatchObject({
      format: 'canto-diagnostics-v1',
      platform: 'native',
      index: 'valid',
      indexedJournals: 1,
      unindexedJournalDirectories: 1,
      pendingTransactions: 0,
      pendingImports: 0,
      rotationCompletionMarker: false,
      journal: {
        keySupplied: true,
        drafts: 1,
        metadata: { total: 1, real: 1 },
        catalog: { total: 1, real: 1 },
        pages: { total: 3, real: 1, legacyZero: 1, deviceFailed: 1 },
      },
    });
    const text = JSON.stringify(diagnostics);
    for (const secret of ['secret text', 'Title d1', 'd1', 'p1', 'mock-docs']) {
      expect(text).not.toContain(secret);
    }
  });

  it('classifies without a key and with an unreadable index', async () => {
    const { store } = await startup();
    await store.saveJournal(journal('n1', [page('p1')]));
    mockFs['/mock-docs/canto/n1/drafts/x.json'] = 'x';
    mockFs['/mock-docs/canto/journals.json'] = 'garbage';
    mockFs['/mock-docs/canto/.imports/i1'] = '{}';
    mockFs['/mock-docs/canto/.transactions/t1/marker.json'] = '{}';
    const diagnostics = await store.collectDiagnostics!('n1');
    expect(diagnostics.index).toBe('unreadable');
    // A locked (keyless) password-protected journal is not reported as broken.
    const key = await deriveKey('pw', new Uint8Array(16).fill(3), 1000);
    await store.collectDiagnostics!('n1');
    mockFs['/mock-docs/canto/journals.json'] = await (
      await startup()
    ).enc.encrypt(JSON.stringify({ journals: [] }));
    const lockedStore = (await startup()).store;
    await lockedStore.saveJournal(journal('lk', [page('p1')], true) as any, key);
    expect((await lockedStore.collectDiagnostics!('lk')).journal).toMatchObject({
      keySupplied: false,
      metadata: { notOpenedWithoutKey: 1, undecryptable: 0 },
      pages: { notOpenedWithoutKey: 1, undecryptable: 0 },
    });
    expect(diagnostics.pendingImports).toBe(1);
    expect(diagnostics.pendingTransactions).toBe(1);
    expect(diagnostics.journal).toMatchObject({
      keySupplied: false,
      pages: { total: 1, deviceOnly: 1 },
    });
    expect((await store.collectDiagnostics!()).journal).toBeUndefined();
  });

  it('ignores a zeroed key and handles a journal without records', async () => {
    const { store } = await startup();
    const diagnostics = await store.collectDiagnostics!('nothing', ZERO);
    expect(diagnostics.index).toBe('absent');
    expect(diagnostics.journal).toMatchObject({
      keySupplied: false,
      drafts: 0,
      metadata: { total: 0 },
      catalog: { total: 0 },
      pages: { total: 0 },
    });
  });
});

describe('encrypted drafts', () => {
  async function seedSecure() {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(5), 1000);
    await store.saveJournal(journal('s', [page('p1')], true) as any, key);
    return { enc, store, key };
  }

  it('round-trips a password-encrypted draft', async () => {
    const { enc, store, key } = await seedSecure();
    await store.saveDraft!('s', page('p1', { text: 'half a thought' }), key);
    const raw = mockFs['/mock-docs/canto/s/drafts/p1.json'];
    expect(raw).toBeDefined();
    expect(await enc.decrypt(raw)).not.toContain('half a thought');
    expect((await store.getDraft!('s', 'p1', key))!.text).toBe('half a thought');
    expect(await store.listDrafts!('s')).toEqual(['p1']);
    await store.deleteDraft!('s', 'p1');
    expect(await store.getDraft!('s', 'p1', key)).toBeNull();
    expect(await store.listDrafts!('s')).toEqual([]);
    await store.deleteDraft!('s', 'p1');
  });

  it('never shows a draft that the key cannot open, or one with a mismatched id', async () => {
    const { enc, store, key } = await seedSecure();
    const wrong = await deriveKey('nope', new Uint8Array(16).fill(5), 1000);
    await store.saveDraft!('s', page('p1'), key);
    expect(await store.getDraft!('s', 'p1', wrong)).toBeNull();
    mockFs['/mock-docs/canto/s/drafts/p2.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(page('other')), key),
    );
    expect(await store.getDraft!('s', 'p2', key)).toBeNull();
    expect(await store.getDraft!('s', 'missing', key)).toBeNull();
  });

  it('requires the key for a secure journal and an existing journal', async () => {
    const { store } = await seedSecure();
    await expect(store.saveDraft!('s', page('p1'))).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    await expect(store.saveDraft!('ghost', page('p1'))).rejects.toThrow('Journal not found');
    expect(Object.keys(mockFs).some((path) => path.includes('/ghost/'))).toBe(false);
  });

  it('stays out of the catalog, recovery scans, and full journal reads', async () => {
    const { store, key } = await seedSecure();
    await store.saveDraft!('s', page('new-page', { text: 'not saved yet' }), key);
    expect((await store.getJournal('s', key))!.pages.map((entry) => entry.id)).toEqual(['p1']);
    expect((await store.scanJournalPages!('s', key)).pageCount).toBe(1);
    await store.restoreJournalCatalog!('s', key);
    expect((await store.getJournalOverview!('s', key))!.pages).toHaveLength(1);
  });

  it('is removed with its page, with its journal, and on password change', async () => {
    const { store, key } = await seedSecure();
    await store.saveDraft!('s', page('p1'), key);
    // A storage delete (also used by sync for remote deletions) keeps the
    // unsaved local draft; the editor discards it on a user delete.
    await store.deletePage('s', 'p1', key);
    expect(await store.listDrafts!('s')).toEqual(['p1']);
    await store.deleteDraft!('s', 'p1');

    await store.savePage('s', page('p2'), key);
    await store.saveDraft!('s', page('p2'), key);
    const full = (await store.getJournal('s', key))!;
    const next = await deriveKey('new', new Uint8Array(16).fill(6), 1000);
    // Reviewer finding 3: a password change refuses instead of silently
    // deleting drafts encrypted under the current password.
    const before = { ...mockFs };
    await expect(store.reencryptJournal(full, key, next)).rejects.toBeInstanceOf(
      DraftsPendingError,
    );
    expect(mockFs).toEqual(before);
    expect((await store.getDraft!('s', 'p2', key))!.id).toBe('p2');
    await store.deleteDraft!('s', 'p2');
    await store.reencryptJournal(full, key, next);

    await store.saveDraft!('s', page('p2'), next);
    await store.deleteJournal('s');
    expect(Object.keys(mockFs).some((path) => path.includes('/s/drafts/'))).toBe(false);
  });
});

describe('rotation and recovery edge paths', () => {
  it('rotates an empty library', async () => {
    const { store } = await startup();
    await store.rotateDeviceKey!(realCustody);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(await (await startup()).store.listJournals()).toEqual([]);
  });

  it('treats a silently lost write as interrupted and repairs it on restart', async () => {
    const { store } = await seedLibrary();
    mockFail.drop = '/j1/pages/p1.json';
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    expect(await SecureStore.getItemAsync(PREVIOUS)).not.toBeNull();
    await expectLibraryReadable((await startup()).store);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
  });

  async function seedLegacyWithAttachments() {
    const { enc, store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(8), 1000);
    await store.saveJournal(journal('a1', [page('p1')], true) as any, key);
    const base = '/mock-docs/canto/a1/attachments';
    const chunkRoot = `${base}/chunk-v1-p2-c-g`;
    const legacyPage = page('p2', {
      images: [
        {
          id: 'plain',
          name: 'p.jpg',
          type: 'image',
          encrypted: false,
          deleted: false,
          path: `${base}/plain.jpg`,
        },
        {
          id: 'real',
          name: 'r.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: `${base}/real.jpg`,
        },
        {
          id: 'bad',
          name: 'b.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: `${base}/bad.jpg`,
        },
        {
          id: 'gone',
          name: 'g.jpg',
          type: 'image',
          encrypted: true,
          deleted: false,
          path: `${base}/gone.jpg`,
        },
        { id: 'nopath', name: 'n.jpg', type: 'image', encrypted: true, deleted: false, path: '' },
      ],
      files: [
        {
          id: 'c',
          name: 'doc.bin',
          type: 'file',
          encrypted: true,
          deleted: false,
          path: chunkRoot,
          content: chunkedContentForByteLength(ATTACHMENT_CHUNK_SIZE + 1),
        },
      ],
    } as any);
    mockFs[`${base}/plain.jpg`] = await enc.encrypt('plain');
    mockFs[`${base}/real.jpg`] = await enc.encrypt(await aesGcmEncrypt('real', key));
    mockFs[`${base}/bad.jpg`] = 'not-device-ciphertext';
    mockFs[`${chunkRoot}/0`] = await enc.encrypt(await aesGcmEncrypt('frame0', ZERO));
    mockFs['/mock-docs/canto/a1/pages/p2.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(legacyPage), ZERO),
    );
    return { enc, store, key, base, chunkRoot };
  }

  it('re-encrypts only zero-key attachment payloads and leaves everything else untouched', async () => {
    const { enc, store, key, base, chunkRoot } = await seedLegacyWithAttachments();
    const before = {
      plain: mockFs[`${base}/plain.jpg`],
      real: mockFs[`${base}/real.jpg`],
      bad: mockFs[`${base}/bad.jpg`],
    };
    expect((await store.restoreJournalCatalog!('a1', key)).legacyPageCount).toBe(1);
    expect(mockFs[`${base}/plain.jpg`]).toBe(before.plain);
    expect(mockFs[`${base}/real.jpg`]).toBe(before.real);
    expect(mockFs[`${base}/bad.jpg`]).toBe(before.bad);
    const chunk = await enc.decrypt(mockFs[`${chunkRoot}/0`]);
    await expect(aesGcmDecrypt(chunk, key)).resolves.toBe('frame0');
  });

  it('skips oversized legacy attachments during recovery', async () => {
    const { store, key, base } = await seedLegacyWithAttachments();
    mockFs[`${base}/real.jpg`] = 'x'.repeat(33 * 1024 * 1024);
    const before = mockFs[`${base}/real.jpg`];
    await store.restoreJournalCatalog!('a1', key);
    expect(mockFs[`${base}/real.jpg`]).toBe(before);
  });

  it('replays an interrupted recovery transaction on restart', async () => {
    const { store, key } = await seedLegacyWithAttachments();
    Object.assign(mockFail, { match: '/a1/page-catalog.json', after: 0, times: 1 });
    await expect(store.restoreJournalCatalog!('a1', key)).rejects.toThrow('simulated write');
    const next = await startup();
    expect((await next.store.getJournalOverview!('a1', key))!.pages).toHaveLength(2);
  });

  it('leaves nothing behind when recovery fails before its commit point', async () => {
    const { store, key } = await seedLegacyWithAttachments();
    mockFail.markerPhase = 'prepared';
    await expect(store.restoreJournalCatalog!('a1', key)).rejects.toThrow('simulated marker');
    expect(Object.keys(mockFs).some((path) => path.includes('/.transactions/'))).toBe(false);
  });

  it('ignores non-page files when verifying keys and counting records', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(2), 1000);
    await store.saveJournal(journal('n1', [page('p1')], true) as any, key);
    mockFs['/mock-docs/canto/n1/pages/p1.json.tmp'] = 'partial';
    expect(await store.verifyJournalKey!('n1', key)).toBe('valid');
    expect((await store.collectDiagnostics!('n1', key)).journal!.pages.total).toBe(1);
  });
});

describe('review follow-ups: rotation', () => {
  // Reviewer finding 1: a completion marker left by a finished rotation used
  // to make a crash in the next rotation look completed, discarding the only
  // key the data was still under.
  it('clears a stale completion marker before the next rotation can change keys', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/.device-key-rotation-complete'] = 'complete';
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    let crashed = false;
    const crashing: DeviceKeyCustody = {
      ...realCustody,
      beginKeyRotation: async (oldKey, newKey) => {
        await realCustody.beginKeyRotation(oldKey, newKey);
        crashed = true;
        throw new Error('process killed');
      },
      abortKeyRotation: async () => {
        // The process is gone: nothing runs after the crash.
      },
    };
    await expect(store.rotateDeviceKey!(crashing)).rejects.toThrow('process killed');
    expect(crashed).toBe(true);
    expect(await store.hasCompletedDeviceKeyRotation!()).toBe(false);

    const next = await startup();
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    await expectLibraryReadable(next.store);
  });

  it('refuses to rotate when a stale marker cannot be cleared', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/.device-key-rotation-complete'] = 'complete';
    const remove = jest
      .spyOn(require('expo-file-system').File.prototype, 'delete')
      .mockImplementationOnce(() => {
        throw new Error('EACCES');
      });
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'ROTATION_PENDING',
    });
    remove.mockRestore();
  });

  it('reports success when only the final marker cleanup fails', async () => {
    const { store } = await seedLibrary();
    const original = require('expo-file-system').File.prototype.delete;
    const remove = jest
      .spyOn(require('expo-file-system').File.prototype, 'delete')
      .mockImplementation(function (this: { uri: string }) {
        if (this.uri.endsWith('.device-key-rotation-complete')) throw new Error('EACCES');
        return original.call(this);
      });
    await store.rotateDeviceKey!(realCustody);
    remove.mockRestore();
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(await store.hasCompletedDeviceKeyRotation!()).toBe(true);
    // The leftover marker is harmless: the next rotation clears it first.
    await store.rotateDeviceKey!(realCustody);
    expect(await store.hasCompletedDeviceKeyRotation!()).toBe(false);
    await expectLibraryReadable((await startup()).store);
  });

  // Reviewer finding 12: verification now proves the new key opens records.
  it('keeps the fallback key when the new key cannot open a rotated record', async () => {
    const { store } = await seedLibrary();
    const corruptStaging: DeviceKeyCustody = {
      ...realCustody,
      beginKeyRotation: async (oldKey, newKey) => {
        await realCustody.beginKeyRotation(oldKey, newKey);
        // Staged copies that match on disk but do not open with the new key.
        for (const path of Object.keys(mockFs)) {
          if (
            /\/\.transactions\/device-[^/]+\/file-\d+$/.test(path) &&
            mockFs[path] !== 'complete'
          ) {
            mockFs[path] = 'corrupt-staging';
          }
        }
      },
    };
    await expect(store.rotateDeviceKey!(corruptStaging)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    expect(await SecureStore.getItemAsync(PREVIOUS)).not.toBeNull();
    await expect(store.savePage('j1', page('p9'))).rejects.toBeInstanceOf(RotationInterruptedError);
  });

  // Reviewer finding 9: the marker goes before the staged files, so a crash
  // during cleanup never leaves a marker pointing at missing staging.
  it('removes a transaction marker before its staged files', async () => {
    const { store } = await seedLibrary();
    const order: string[] = [];
    const fs = require('expo-file-system');
    const fileDelete = fs.File.prototype.delete;
    const dirDelete = fs.Directory.prototype.delete;
    const fileSpy = jest.spyOn(fs.File.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      if (this.uri.includes('/.transactions/')) order.push('marker');
      return fileDelete.call(this);
    });
    const dirSpy = jest.spyOn(fs.Directory.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      if (this.uri.includes('/.transactions/')) order.push('directory');
      return dirDelete.call(this);
    });
    await store.savePage('j1', page('p3'));
    fileSpy.mockRestore();
    dirSpy.mockRestore();
    expect(order).toEqual(['marker', 'directory']);
  });

  it('rolls back a leftover transaction directory whose marker is gone', async () => {
    await seedLibrary();
    mockFs['/mock-docs/canto/.transactions/page-x/file-1'] = 'orphan staging';
    const next = await startup();
    expect(Object.keys(mockFs).some((key) => key.includes('/.transactions/'))).toBe(false);
    await expectLibraryReadable(next.store);
  });
});

describe('record id validation (review finding 11)', () => {
  it('rejects ids that would leave their directory', async () => {
    const { store } = await seedLibrary();
    const before = { ...mockFs };
    for (const bad of ['../metadata', '..', '.', '', 'a/b', 'a\\b']) {
      await expect(store.deleteDraft!('j1', bad)).rejects.toThrow('Invalid record id');
      await expect(store.getPage('j1', bad)).rejects.toThrow('Invalid record id');
    }
    await expect(store.deletePage('j1', '../metadata')).rejects.toThrow('Invalid record id');
    await expect(store.getJournal('../canto')).rejects.toThrow('Invalid record id');
    expect(mockFs).toEqual(before);
  });
});

describe('coverage of refusal paths', () => {
  it('rotates when the platform cannot report free space', async () => {
    const { store } = await seedLibrary();
    Object.defineProperty(Paths, 'availableDiskSpace', {
      configurable: true,
      get: () => {
        throw new Error('unsupported');
      },
    });
    await store.rotateDeviceKey!(realCustody);
    delete (Paths as any).availableDiskSpace;
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
  });

  it('refuses recovery with a key that opens no record', async () => {
    const { enc, store } = await startup();
    const key = await deriveKey('right', new Uint8Array(16).fill(4), 1000);
    const other = await deriveKey('wrong', new Uint8Array(16).fill(4), 1000);
    await store.saveJournal(journal('w1', [page('p1')], true) as any, key);
    mockFs['/mock-docs/canto/w1/pages/p1.json'] = await enc.encrypt(
      await aesGcmEncrypt(JSON.stringify(page('p1')), ZERO),
    );
    const before = { ...mockFs };
    await expect(store.restoreJournalCatalog!('w1', other)).rejects.toMatchObject({
      code: 'JOURNAL_LOCKED',
    });
    expect(mockFs).toEqual(before);
  });
});

describe('data-loss review: rollback failure', () => {
  // A failed commit-marker write followed by a failed rollback used to leave
  // the store unsealed with the new key cached; later saves were written
  // under a key the next startup discarded.
  it('seals writes and keeps every record readable when the rollback itself fails', async () => {
    const { store } = await seedLibrary();
    const oldHex = (await SecureStore.getItemAsync(CURRENT))!;
    mockFail.markerPhase = 'committing';
    const failingRollback: DeviceKeyCustody = {
      ...realCustody,
      abortKeyRotation: async () => {
        throw new Error('SecureStore unavailable');
      },
    };
    await expect(store.rotateDeviceKey!(failingRollback)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    await expect(store.savePage('j1', page('p-new'))).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );

    const next = await startup();
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    await expectLibraryReadable(next.store);
    await next.store.savePage('j1', page('p-new'));
    expect((await (await startup()).store.getPage('j1', 'p-new'))!.id).toBe('p-new');
  });

  it('seals writes when the rollback after a failed key cutover fails', async () => {
    const { store } = await seedLibrary();
    await expect(
      store.rotateDeviceKey!({
        ...realCustody,
        beginKeyRotation: async () => {
          throw new Error('cutover failed');
        },
        abortKeyRotation: async () => {
          throw new Error('rollback failed');
        },
      }),
    ).rejects.toBeInstanceOf(RotationInterruptedError);
    await expect(store.savePage('j1', page('p-new'))).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    await expectLibraryReadable((await startup()).store);
  });
});

describe('data-loss review: transaction cleanup failures', () => {
  const fs = require('expo-file-system');

  it('reports a save as done when only its cleanup fails, and never replays it over later saves', async () => {
    const { store } = await seedLibrary();
    const fileDelete = fs.File.prototype.delete;
    const markerSpy = jest.spyOn(fs.File.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      if (this.uri.endsWith('/marker.json')) throw new Error('EBUSY');
      return fileDelete.call(this);
    });
    const dirSpy = jest.spyOn(fs.Directory.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      if (this.uri.includes('/.transactions/')) throw new Error('EBUSY');
      for (const key of Object.keys(mockFs)) if (key.startsWith(`${this.uri}/`)) delete mockFs[key];
    });

    await store.savePage('j1', page('p1', { text: 'first save' }));
    markerSpy.mockRestore();
    dirSpy.mockRestore();
    await store.savePage('j1', page('p1', { text: 'newer save' }));

    // Startup only removes the retired leftover; it does not replay it.
    const next = await startup();
    expect((await next.store.getPage('j1', 'p1'))!.text).toBe('newer save');
    expect(Object.keys(mockFs).some((key) => key.includes('/.transactions/'))).toBe(false);
  });

  it('keeps attachment roots referenced by a retired transaction', async () => {
    const { store } = await seedLibrary();
    mockFs['/mock-docs/canto/.transactions/password-x/marker.json'] = JSON.stringify({
      phase: 'retired',
      files: [],
      newRoots: ['/mock-docs/canto/j1/attachments/chunk-v1-p1-a-new'],
    });
    mockFs['/mock-docs/canto/j1/attachments/chunk-v1-p1-a-new/0'] = 'in use';
    await startup();
    expect(mockFs['/mock-docs/canto/j1/attachments/chunk-v1-p1-a-new/0']).toBe('in use');
    await expectLibraryReadable(store);
  });

  it('does not report a finished password change as failed when old attachments cannot be removed', async () => {
    const { store } = await startup();
    const oldKey = await deriveKey('old', new Uint8Array(16).fill(2), 1000);
    const newKey = await deriveKey('new', new Uint8Array(16).fill(2), 1000);
    const base64 = Buffer.from('chunk').toString('base64');
    const attachment = {
      id: 'a',
      name: 'a.bin',
      type: 'file',
      encrypted: true,
      deleted: false,
      path: '',
      content: chunkedContentForByteLength(5),
    } as any;
    await store.saveJournal(journal('pw', [page('p1')], true) as any, oldKey);
    attachment.path = await store.saveAttachment('pw', 'p1', attachment, base64, oldKey);
    await store.savePage('pw', page('p1', { files: [attachment] }), oldKey);
    const dirDelete = fs.Directory.prototype.delete;
    const spy = jest.spyOn(fs.Directory.prototype, 'delete').mockImplementation(function (this: {
      uri: string;
    }) {
      if (this.uri.includes('/chunk-v1-')) throw new Error('EBUSY');
      return dirDelete.call(this);
    });
    await store.reencryptJournal((await store.getJournal('pw', oldKey))!, oldKey, newKey);
    spy.mockRestore();
    expect((await store.getJournal('pw', newKey))!.pages[0].files).toHaveLength(1);
  });
});

describe('import markers with unusable ids', () => {
  it('skip the marker instead of failing every startup', async () => {
    await seedLibrary();
    // Markers must name their own file, so only a dot-segment name can carry
    // an unusable id; the guard is defensive.
    mockFs['/mock-docs/canto/.imports/..'] = JSON.stringify({
      version: 2,
      journalId: '..',
      phase: 'prepared',
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const next = await startup();
    await expectLibraryReadable(next.store);
    expect(warn).toHaveBeenCalledWith('[Canto] Skipping an import marker with an unusable id');
  });
});

describe('recovery with unreadable metadata', () => {
  it('rebuilds the page list without touching metadata it cannot read', async () => {
    const { store } = await startup();
    const key = await deriveKey('pw', new Uint8Array(16).fill(4), 1000);
    await store.saveJournal(journal('um', [page('p1'), page('p2')], true) as any, key);
    mockFs['/mock-docs/canto/um/metadata.json'] = 'not-device-ciphertext';
    const restored = await store.restoreJournalCatalog!('um', key);
    expect(restored.pageCount).toBe(2);
    expect(mockFs['/mock-docs/canto/um/metadata.json']).toBe('not-device-ciphertext');
  });
});

describe('device testing: rotation must cover every journal record', () => {
  // Found on Android: directory uris end with '/', so the journal prefix was
  // built as '.../j1//' and matched nothing. Rotation re-encrypted only the
  // index, then deleted the old key the journals still needed. The mock now
  // reproduces Android's uris (see the expo-file-system mock above), and
  // 'rotates every record' covers the fix. This test covers the backstop.
  it('refuses, changing nothing, if the file listing misses a journal record', async () => {
    const { store } = await seedLibrary();
    const fs = require('expo-file-system');
    const list = fs.Directory.prototype.list;
    const spy = jest.spyOn(fs.Directory.prototype, 'list').mockImplementation(function (this: {
      uri: string;
    }) {
      const entries = list.call(this) as { uri: string }[];
      return entries.filter((entry) => !entry.uri.endsWith('/j2/metadata.json'));
    });
    const before = { ...mockFs };
    const oldHex = await SecureStore.getItemAsync(CURRENT);
    await expect(store.rotateDeviceKey!(realCustody)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });
    spy.mockRestore();
    expect(await SecureStore.getItemAsync(CURRENT)).toBe(oldHex);
    expect(await SecureStore.getItemAsync(PREVIOUS)).toBeNull();
    expect(mockFs).toEqual(before);
    await expectLibraryReadable((await startup()).store);
  });
});
