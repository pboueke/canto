/**
 * End-to-end sync test for GDrive implementation.
 * Tests the full journal sync lifecycle using SyncEngine + GDriveRemoteStore
 * with a simulated in-memory GDrive backend.
 */
import { SyncEngine } from '../sync/engine';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import { InMemoryDrive } from './helpers/in-memory-drive';
import {
  makePage,
  makeAttachment,
  makeJournal,
  createMockLocalStore,
} from './helpers/sync-test-helpers';

jest.mock('../sync/gdrive/api');
jest.mock('../encryption/utils', () => ({
  ...jest.requireActual('../encryption/utils'),
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));
const mockedApi = api as jest.Mocked<typeof api>;

const SYNC_KEY = new Uint8Array(32).fill(1);

/** Helper to build a sync index JSON from pages for pre-populating remote state. */
function buildIndexJson(pages: Array<{ id: string; modified: number; deleted?: boolean }>): string {
  const index: Record<string, { modified: number; deleted?: boolean }> = {};
  for (const p of pages) {
    index[p.id] = { modified: p.modified, ...(p.deleted ? { deleted: true } : {}) };
  }
  return JSON.stringify(index);
}

// ---------- tests ----------

describe('GDrive sync E2E', () => {
  const drive = new InMemoryDrive(mockedApi);
  let store: GDriveRemoteStore;

  beforeEach(async () => {
    drive.setup();
    store = new GDriveRemoteStore();
    await store.connect({ accessToken: 'test-token' });
  });

  it('first sync: uploads all local pages to empty GDrive', async () => {
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const journal = makeJournal([p1, p2]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.uploaded).toHaveLength(2);
    expect(result.uploaded).toContain('p1');
    expect(result.uploaded).toContain('p2');
    expect(result.downloaded).toHaveLength(0);
  });

  it('second sync: downloads remote-only pages', async () => {
    const p1 = makePage('p1', 1000);
    const emptyJournal = makeJournal([]);
    const local = createMockLocalStore(emptyJournal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...emptyJournal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(p1));
    drive.putFile('index.json', jFolderId, buildIndexJson([p1]));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
    expect(local.savePage).toHaveBeenCalledWith('j1', p1, SYNC_KEY, true);
  });

  it('conflict resolution: local newer wins', async () => {
    const localPage = makePage('p1', 5000);
    const remotePage = makePage('p1', 1000);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('index.json', jFolderId, buildIndexJson([remotePage]));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.uploaded).toContain('p1');
    expect(result.downloaded).toHaveLength(0);
  });

  it('conflict resolution: remote newer wins', async () => {
    const localPage = makePage('p1', 1000);
    const remotePage = makePage('p1', 5000);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('index.json', jFolderId, buildIndexJson([remotePage]));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
    expect(result.uploaded).toHaveLength(0);
    expect(local.savePage).toHaveBeenCalledWith('j1', remotePage, SYNC_KEY, true);
  });

  it('local deletion propagates to remote', async () => {
    const localPage = makePage('p1', 2000, true);
    const remotePage = makePage('p1', 1000, false);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    const pageFileId = drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('index.json', jFolderId, buildIndexJson([remotePage]));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.deleted).toContain('p1');
    expect(drive.isTrashed(pageFileId)).toBe(true);
  });

  it('remote deletion propagates to local', async () => {
    const localPage = makePage('p1', 1000, false);
    const remotePage = makePage('p1', 2000, true);
    const journal = makeJournal([localPage]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('index.json', jFolderId, buildIndexJson([remotePage]));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.deleted).toContain('p1');
    expect(local.deletePage).toHaveBeenCalledWith('j1', 'p1', SYNC_KEY);
  });

  it('attachment upload: local attachment gets gdrive:// path', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.uploaded).toContain('p1');
    expect(local.getAttachment).toHaveBeenCalledWith('/local/files/img1.png');
    expect(mockedApi.createFile).toHaveBeenCalledWith(
      'test-token',
      expect.objectContaining({ name: 'img1.png' }),
      expect.any(String), // encrypted data
    );
  });

  it('attachment download: remote attachment saved locally', async () => {
    const att = makeAttachment('img1', '/remote/img1.png');
    const remotePage = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([]);
    const local = createMockLocalStore(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    const attFolderId = drive.putFolder('attachments', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(makeJournal([])));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('index.json', jFolderId, buildIndexJson([remotePage]));
    drive.putFile('img1.png', attFolderId, 'base64imagedata');
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
    expect(local.saveAttachment).toHaveBeenCalled();
  });

  it('encrypted journal: derivedKey threaded through sync', async () => {
    const page = makePage('p1', 1000);
    const journal = makeJournal([page], true, 'base64salt==');
    const local = createMockLocalStore(journal);
    const derivedKey = new Uint8Array(32).fill(42);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', derivedKey);

    expect(local.getJournal).toHaveBeenCalledWith('j1', derivedKey);
  });

  it('handles missing local attachment gracefully', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);
    (local.getAttachment as jest.Mock).mockResolvedValue(null);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.uploaded).toContain('p1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
    consoleSpy.mockRestore();
  });

  it('multiple pages with attachments sync correctly', async () => {
    const att1 = makeAttachment('img1', '/local/files/img1.png');
    const att2 = makeAttachment('img2', '/local/files/img2.png');
    const p1 = makePage('p1', 1000, false, [att1]);
    const p2 = makePage('p2', 2000, false, [att2]);
    const journal = makeJournal([p1, p2]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.uploaded).toHaveLength(2);
    expect(local.getAttachment).toHaveBeenCalledTimes(2);
  });

  it('sync with one corrupted remote page still downloads others', async () => {
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(makeJournal([])));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(makePage('p1', 1000)));
    drive.putFile('p2.json', pagesFolderId, 'this is not valid json!!!');
    drive.putFile(
      'index.json',
      jFolderId,
      buildIndexJson([
        { id: 'p1', modified: 1000 },
        { id: 'p2', modified: 2000 },
      ]),
    );
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const journal = makeJournal([]);
    const local = createMockLocalStore(journal);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
    consoleSpy.mockRestore();
  });

  it('full cycle: sync, modify remotely, re-sync downloads changes', async () => {
    const p1 = makePage('p1', 1000);
    const journal = makeJournal([p1]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    const result1 = await engine.sync('j1', SYNC_KEY);
    expect(result1.uploaded).toContain('p1');

    const updatedPage = makePage('p1', 5000);

    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    await store2.uploadPage('j1', updatedPage.id, JSON.stringify(updatedPage));
    await store2.uploadSyncIndex('j1', { p1: { modified: 5000 } });

    const store3 = new GDriveRemoteStore();
    await store3.connect({ accessToken: 'test-token' });
    const engine2 = new SyncEngine(local, store3);
    const result2 = await engine2.sync('j1', SYNC_KEY);

    expect(result2.downloaded).toContain('p1');
  });
});
