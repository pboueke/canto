/**
 * End-to-end cross-device password change tests.
 *
 * Exercises the user's reported scenario: device A creates a journal, device B
 * imports and changes the password, device A syncs again. With the
 * lastKnownRemoteSalt tracking, A must NOT corrupt remote with stale data.
 *
 * Uses key-aware encryption mock + real SyncManager (with mocked AsyncStorage)
 * + two InMemoryLocalStore instances sharing one InMemoryDrive.
 */
import type { Page } from 'canto-data';
import { SyncManager } from '../sync/manager';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import { InMemoryDrive } from './helpers/in-memory-drive';
import { createInMemoryLocalStore, type Platform } from './helpers/in-memory-local-store';
import { createMockEncryption } from './helpers/mock-encryption';
import { keyTag } from './helpers/key-aware-crypto';
import { makeAttachment, makeJournal, makePage } from './helpers/sync-test-helpers';

jest.mock('../sync/gdrive/api');
jest.mock('../encryption/utils', () => ({
  ...jest.requireActual('../encryption/utils'),
  ...require('./helpers/key-aware-crypto').keyAwareCryptoMock(),
}));

// Mock AsyncStorage with a per-test reset
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(asyncStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    asyncStore[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    delete asyncStore[key];
    return Promise.resolve();
  }),
}));

// Mock deriveKey to return a deterministic "key" derived from password+salt string
// (so different salts/passwords produce different "keys" in tests)
jest.mock('../encryption/password', () => {
  const actual = jest.requireActual('../encryption/password');
  return {
    ...actual,
    deriveKey: jest.fn((password: string, salt: Uint8Array) => {
      // First 4 bytes encode password+salt, rest are zero — produces unique keyTag per (pwd, salt).
      const out = new Uint8Array(32);
      const tag = `${password}|${Array.from(salt).join(',')}`;
      let h = 0;
      for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
      out[0] = (h >> 24) & 0xff;
      out[1] = (h >> 16) & 0xff;
      out[2] = (h >> 8) & 0xff;
      out[3] = h & 0xff;
      return Promise.resolve(out);
    }),
  };
});

const mockedApi = api as jest.Mocked<typeof api>;

function createDevice(drive: InMemoryDrive, platform: Platform) {
  const encryption = createMockEncryption();
  const local = createInMemoryLocalStore(encryption, platform);
  const remote = new GDriveRemoteStore();
  const manager = new SyncManager(local, remote);
  return { local, remote, manager, encryption };
}

beforeEach(() => {
  Object.keys(asyncStore).forEach((k) => delete asyncStore[k]);
});

describe('Cross-device password change', () => {
  const drive = new InMemoryDrive(mockedApi);

  beforeEach(async () => {
    drive.setup();
  });

  /**
   * Helper to simulate per-device AsyncStorage isolation. Both device managers
   * share the global mocked AsyncStorage, but in reality each device has its
   * own. This snapshot/restore pattern lets us swap "which device's storage"
   * is currently active.
   */
  function snapshotAsyncStore(): Record<string, string> {
    return { ...asyncStore };
  }
  function restoreAsyncStore(snapshot: Record<string, string>): void {
    Object.keys(asyncStore).forEach((k) => delete asyncStore[k]);
    Object.assign(asyncStore, snapshot);
  }

  it("device A's sync after device B changed password does NOT corrupt remote", async () => {
    // === Device A: create journal (no password), sync ===
    const deviceA = createDevice(drive, 'native');
    const journalA = makeJournal(
      [makePage('p1', 1000, false, [], 'Original content')],
      false,
      'b3JpZ3NhbHQ=',
    );
    await deviceA.local.saveJournal(journalA);
    await deviceA.remote.connect({ accessToken: 'token' });

    const resultA1 = await deviceA.manager.syncJournal('jX', 'token');
    expect(resultA1).toBeNull(); // wrong id, no journal to sync

    // Sync the actual journal
    const resultA1b = await deviceA.manager.syncJournal(journalA.id, 'token');
    expect(resultA1b).not.toBeNull();

    // Verify A recorded the original salt
    expect(asyncStore[`canto:lastRemoteSalt:${journalA.id}`]).toBe('b3JpZ3NhbHQ=');

    // === Snapshot device A's storage state before device B operates ===
    const deviceAStorage = snapshotAsyncStore();

    // === Device B: import (different local instance), change password, sync ===
    // Reset asyncStore to simulate B's clean device state
    restoreAsyncStore({});
    const deviceB = createDevice(drive, 'web');
    await deviceB.remote.connect({ accessToken: 'token' });

    // Simulate cloud import on B: copy journal locally with original salt
    const importedJournal = { ...journalA };
    await deviceB.local.saveJournal(importedJournal);
    // B records the imported salt (this is the new NewJournalModal behavior)
    await deviceB.manager.recordRemoteSalt(journalA.id, 'b3JpZ3NhbHQ=');

    // B changes the password locally: new salt, secure=true, re-encrypt
    const updatedJournal = {
      ...importedJournal,
      secure: true,
      salt: 'bmV3c2FsdA==',
    };
    const newKey = new Uint8Array(32).fill(50); // simulated new key
    await deviceB.local.reencryptJournal(updatedJournal, undefined, newKey);

    // B syncs (with newKey as derivedKey)
    const resultB = await deviceB.manager.syncJournal(journalA.id, 'token', newKey);
    expect(resultB).not.toBeNull();

    // Verify B updated the registry to new salt
    const registry = JSON.parse(
      drive.dump().find((f) => f.name === 'canto-journals.json')!.content,
    );
    expect(registry[0].salt).toBe('bmV3c2FsdA==');
    expect(registry[0].encrypted).toBe(true);

    // === Restore device A's local storage and sync again ===
    // A still has lastKnownRemoteSalt = 'b3JpZ3NhbHQ=' (the original) and local salt =
    // 'b3JpZ3NhbHQ='. Remote salt is now 'bmV3c2FsdA=='. A's sync MUST abort.
    restoreAsyncStore(deviceAStorage);
    const resultA2 = await deviceA.manager.syncJournal(journalA.id, 'token');
    expect(resultA2).toBeNull();
    expect(deviceA.manager.getState(journalA.id).status).toBe('error');
    expect(deviceA.manager.getState(journalA.id).error).toMatch(/changed on another device/i);

    // Critical: remote registry is UNCHANGED — A's sync did not corrupt it
    const registryAfter = JSON.parse(
      drive.dump().find((f) => f.name === 'canto-journals.json')!.content,
    );
    expect(registryAfter[0].salt).toBe('bmV3c2FsdA==');
    expect(registryAfter[0].encrypted).toBe(true);
  });

  it('device A wipes local data and re-imports from cloud — works after B changed password', async () => {
    // Setup: device A creates + syncs, device B changes password + syncs (same as above)
    const deviceA = createDevice(drive, 'native');
    const journal = makeJournal([makePage('p1', 1000, false, [], 'Hello')], false, 'b3JpZ3NhbHQ=');
    await deviceA.local.saveJournal(journal);
    await deviceA.remote.connect({ accessToken: 'token' });
    await deviceA.manager.syncJournal(journal.id, 'token');

    // Snapshot A, swap to fresh storage for B
    restoreAsyncStore({});
    const deviceB = createDevice(drive, 'web');
    await deviceB.remote.connect({ accessToken: 'token' });
    await deviceB.local.saveJournal(journal);
    await deviceB.manager.recordRemoteSalt(journal.id, 'b3JpZ3NhbHQ=');
    const newKey = new Uint8Array(32).fill(50);
    const updatedJournal = { ...journal, secure: true, salt: 'bmV3c2FsdA==' };
    await deviceB.local.reencryptJournal(updatedJournal, undefined, newKey);
    await deviceB.manager.syncJournal(journal.id, 'token', newKey);

    // === A wipes data (simulated by clearing both A's storage AND removing local journal) ===
    restoreAsyncStore({});
    await deviceA.local.deleteJournal(journal.id);

    // === A cloud-imports: registry shows new salt + encrypted=true. Use newKey. ===
    const remoteJournals = await deviceA.remote.listRemoteJournals();
    const remote = remoteJournals.find((j) => j.id === journal.id)!;
    expect(remote.salt).toBe('bmV3c2FsdA==');
    expect(remote.encrypted).toBe(true);

    // Decrypt metadata + pages with newKey (this is what executeCloudImport does)
    const encryptedMeta = await deviceA.remote.downloadJournalMeta(journal.id);
    expect(encryptedMeta).not.toBeNull();
    expect(encryptedMeta).toMatch(new RegExp(`^ENC:${keyTag(newKey)}:`));
    // Successful round-trip: importing with the right key recovers data.
    // (Full executeCloudImport flow is verified in gdrive-sync-encryption.test.ts;
    // here we just confirm remote is in a CONSISTENT state — registry's salt
    // matches what pages were encrypted with.)
    const syncIndex = await deviceA.remote.downloadSyncIndex(journal.id);
    expect(syncIndex).not.toBeNull();
    const pageIds = Object.keys(syncIndex!).filter((id) => !syncIndex![id].deleted);
    for (const pid of pageIds) {
      const pageContent = await deviceA.remote.downloadPage(journal.id, pid);
      expect(pageContent).toMatch(new RegExp(`^ENC:${keyTag(newKey)}:`));
    }
  });

  it('cloud import seeds lastKnownRemoteSalt — next sync does not false-positive', async () => {
    // Setup: device B has a journal on remote
    const deviceB = createDevice(drive, 'web');
    await deviceB.remote.connect({ accessToken: 'token' });
    const journal = makeJournal([makePage('p1', 1000)], false, 'c2VlZHNhbHQ=');
    await deviceB.local.saveJournal(journal);
    await deviceB.manager.syncJournal(journal.id, 'token');

    // Device A imports
    const deviceA = createDevice(drive, 'native');
    await deviceA.remote.connect({ accessToken: 'token' });
    const remoteJournals = await deviceA.remote.listRemoteJournals();
    const remote = remoteJournals.find((j) => j.id === journal.id)!;

    // Save journal locally + record the salt (this is what NewJournalModal does after import)
    await deviceA.local.saveJournal(journal);
    await deviceA.manager.recordRemoteSalt(journal.id, remote.salt!);

    // Now A syncs — should succeed without false-positive abort
    const result = await deviceA.manager.syncJournal(journal.id, 'token');
    expect(result).not.toBeNull();
    expect(deviceA.manager.getState(journal.id).status).toBe('idle');
  });

  it('attachment image loads correctly after password change + re-sync + cloud import', async () => {
    // The exact user scenario: journal with image on a page, sync, change password,
    // re-sync, wipe, re-import, view image. The image must decrypt properly.

    // === Device A: create journal with image attachment, no password ===
    const deviceA = createDevice(drive, 'native');
    await deviceA.remote.connect({ accessToken: 'token' });

    const imageAtt = makeAttachment('img1', ''); // path filled after save
    const page = makePage('p1', 1000, false, [imageAtt], 'Page with image');
    const journal = makeJournal([page], false, 'b3JpZ3NhbHQ=');
    await deviceA.local.saveJournal(journal);
    const rawImageData = 'base64rawimagedata';
    const savedPath = await deviceA.local.saveAttachment('j1', 'p1', imageAtt, rawImageData);
    // Persist the path back into the page record
    const loadedJournal = await deviceA.local.getJournal('j1');
    loadedJournal!.pages[0].images[0].path = savedPath;
    await deviceA.local.saveJournal(loadedJournal!);

    await deviceA.manager.syncJournal('j1', 'token');

    // === Device B: import, change password, sync ===
    restoreAsyncStore({});
    const deviceB = createDevice(drive, 'web');
    await deviceB.remote.connect({ accessToken: 'token' });

    // Simulate cloud import on B: copy journal locally (webified path), save attachment too
    const importedJournal = {
      ...loadedJournal!,
      // Reset attachment path for B's platform
      pages: loadedJournal!.pages.map((p) => ({
        ...p,
        images: p.images.map((a) => ({ ...a, path: '' })),
      })),
    };
    await deviceB.local.saveJournal(importedJournal);
    const bPath = await deviceB.local.saveAttachment(
      'j1',
      'p1',
      importedJournal.pages[0].images[0],
      rawImageData,
    );
    importedJournal.pages[0].images[0].path = bPath;
    await deviceB.local.saveJournal(importedJournal);
    await deviceB.manager.recordRemoteSalt('j1', 'b3JpZ3NhbHQ=');

    // B changes password
    const newKey = new Uint8Array(32).fill(50);
    const afterPasswordChange = {
      ...importedJournal,
      secure: true,
      salt: 'bmV3c2FsdA==',
    };
    await deviceB.local.reencryptJournal(afterPasswordChange, undefined, newKey);

    // Re-fetch the journal to pick up the new att.encrypted flag that
    // reencryptJournal just wrote
    const reloadedB = await deviceB.local.getJournal('j1', newKey);
    expect(reloadedB!.pages[0].images[0].encrypted).toBe(true);

    // B syncs with newKey
    await deviceB.manager.syncJournal('j1', 'token', newKey);

    // === Device A: wipe, re-import via executeCloudImport-style flow ===
    restoreAsyncStore({});
    await deviceA.local.deleteJournal('j1');

    const remoteJournals = await deviceA.remote.listRemoteJournals();
    const remoteMeta = remoteJournals.find((j) => j.id === 'j1')!;
    expect(remoteMeta.salt).toBe('bmV3c2FsdA==');
    expect(remoteMeta.encrypted).toBe(true);

    // Simulate cloud import (mirrors NewJournalModal.executeCloudImport)
    const { aesGcmDecrypt: mockDecrypt } = jest.requireMock('../encryption/utils') as {
      aesGcmDecrypt: jest.Mock;
    };

    const encryptedMeta = await deviceA.remote.downloadJournalMeta('j1');
    const metaJson = await mockDecrypt(encryptedMeta!, newKey);
    const meta = JSON.parse(metaJson);
    const fullJournal = { ...meta, pages: [] as Page[] };

    const syncIndex = await deviceA.remote.downloadSyncIndex('j1');
    const pageIds = Object.keys(syncIndex!).filter((id) => !syncIndex![id].deleted);
    for (const pid of pageIds) {
      const encryptedPage = await deviceA.remote.downloadPage('j1', pid);
      const pageJson = await mockDecrypt(encryptedPage!, newKey);
      const parsedPage = JSON.parse(pageJson) as Page;
      fullJournal.pages.push(parsedPage);

      // Download + decrypt each attachment, save locally
      const atts = [...(parsedPage.images ?? []), ...(parsedPage.files ?? [])].filter(
        (a) => !a.deleted,
      );
      for (const att of atts) {
        const filename = att.path.split('/').pop() ?? att.path;
        const encrypted = await deviceA.remote.downloadAttachment(
          `gdrive://j1/attachments/${filename}`,
        );
        if (encrypted) {
          const data = await mockDecrypt(encrypted, newKey);
          const localPath = await deviceA.local.saveAttachment('j1', parsedPage.id, att, data);
          att.path = localPath;
        }
      }
    }

    await deviceA.local.saveJournal(fullJournal, newKey);
    for (const p of fullJournal.pages) {
      await deviceA.local.savePage('j1', p, newKey, true);
    }

    // === Verify: user can view the image ===
    const aReloaded = await deviceA.local.getJournal('j1', newKey);
    const reimportedAtt = aReloaded!.pages[0].images[0];

    // Flag must reflect reality: attachment has password layer
    expect(reimportedAtt.encrypted).toBe(true);

    // And the image data, when loaded with the correct key, must equal the original
    const loaded = await deviceA.local.getAttachment(reimportedAtt.path, newKey);
    expect(loaded).toBe(rawImageData);
  });
});
