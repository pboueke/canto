/**
 * Web platform E2E sync tests.
 * Mirrors gdrive-sync-e2e.test.ts but uses InMemoryLocalStore configured for web,
 * exercising real storage logic (encryption, path generation, timestamp handling).
 */
import { SyncEngine } from '../sync/engine';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import { InMemoryDrive } from './helpers/in-memory-drive';
import { makePage, makeAttachment, makeJournal } from './helpers/sync-test-helpers';
import { createInMemoryLocalStore } from './helpers/in-memory-local-store';
import { createMockEncryption } from './helpers/mock-encryption';

jest.mock('../sync/gdrive/api');
const mockedApi = api as jest.Mocked<typeof api>;

describe('GDrive sync E2E (web platform)', () => {
  const drive = new InMemoryDrive(mockedApi);
  let store: GDriveRemoteStore;
  const encryption = createMockEncryption();

  function createWebLocal() {
    return createInMemoryLocalStore(encryption, 'web');
  }

  beforeEach(async () => {
    drive.setup();
    store = new GDriveRemoteStore();
    await store.connect({ accessToken: 'test-token' });
  });

  it('first sync: uploads all local pages to empty GDrive', async () => {
    const local = createWebLocal();
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const journal = makeJournal([p1, p2]);
    await local.saveJournal(journal);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(2);
    expect(result.uploaded).toContain('p1');
    expect(result.uploaded).toContain('p2');
    expect(result.downloaded).toHaveLength(0);
  });

  it('second sync: downloads remote-only pages', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const p1 = makePage('p1', 1000);
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...emptyJournal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(p1));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    const savedPage = await local.getPage('j1', 'p1');
    expect(savedPage).not.toBeNull();
    expect(savedPage!.text).toBe(p1.text);
  });

  it('conflict resolution: local newer wins', async () => {
    const local = createWebLocal();
    const localPage = makePage('p1', 5000);
    const journal = makeJournal([localPage]);
    await local.saveJournal(journal);

    const remotePage = makePage('p1', 1000);
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    expect(result.downloaded).toHaveLength(0);
  });

  it('conflict resolution: remote newer wins', async () => {
    const local = createWebLocal();
    const localPage = makePage('p1', 1000);
    const journal = makeJournal([localPage]);
    await local.saveJournal(journal);

    const remotePage = makePage('p1', 5000, false, [], 'Remote edited text');
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    expect(result.uploaded).toHaveLength(0);
    const savedPage = await local.getPage('j1', 'p1');
    expect(savedPage!.text).toBe('Remote edited text');
  });

  it('conflict resolution: equal timestamps → no-op', async () => {
    const local = createWebLocal();
    const page = makePage('p1', 3000);
    const journal = makeJournal([page]);
    await local.saveJournal(journal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(page));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(0);
    expect(result.downloaded).toHaveLength(0);
  });

  it('local deletion propagates to remote', async () => {
    const local = createWebLocal();
    const localPage = makePage('p1', 2000, true);
    const journal = makeJournal([localPage]);
    await local.saveJournal(journal);

    const remotePage = makePage('p1', 1000, false);
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    const pageFileId = drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.deleted).toContain('p1');
    expect(drive.isTrashed(pageFileId)).toBe(true);
  });

  it('remote deletion propagates to local', async () => {
    const local = createWebLocal();
    const localPage = makePage('p1', 1000, false);
    const journal = makeJournal([localPage]);
    await local.saveJournal(journal);

    const remotePage = makePage('p1', 2000, true);
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify({ ...journal }));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.deleted).toContain('p1');
    const deletedPage = await local.getPage('j1', 'p1');
    expect(deletedPage!.deleted).toBe(true);
  });

  it('attachment upload: web path gets gdrive:// path on remote', async () => {
    const local = createWebLocal();
    const att = makeAttachment('img1', '');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    await local.saveJournal(journal);
    // Save attachment with web path
    const attPath = await local.saveAttachment('j1', 'p1', att, 'base64imagedata');
    page.images[0].path = attPath;
    await local.savePage('j1', page, undefined, true);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    // Verify attachment was uploaded (octet-stream content type = attachment)
    const createCalls = mockedApi.createFile.mock.calls;
    const attachmentCall = createCalls.find(
      (call) => (call[1] as { mimeType?: string }).mimeType === 'application/octet-stream',
    );
    expect(attachmentCall).toBeDefined();
    expect(attachmentCall![2]).toBe('base64imagedata');
  });

  it('attachment download: remote attachment saved with web path', async () => {
    const local = createWebLocal();
    const att = makeAttachment('img1', 'gdrive://j1/attachments/img1.png');
    const remotePage = makePage('p1', 1000, false, [att]);
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    const attFolderId = drive.putFolder('attachments', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile('img1.png', attFolderId, 'base64imagedata');
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    const savedPage = await local.getPage('j1', 'p1');
    expect(savedPage).not.toBeNull();
    // Attachment path should be a web-format path (not gdrive://)
    expect(savedPage!.images[0].path).toMatch(/^canto\//);
  });

  it('encrypted journal: derivedKey threaded through sync', async () => {
    const local = createWebLocal();
    const page = makePage('p1', 1000);
    const journal = makeJournal([page], true, 'base64salt==');
    const derivedKey = new Uint8Array(32).fill(42);
    await local.saveJournal(journal, derivedKey);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', derivedKey);

    expect(result.uploaded).toContain('p1');
  });

  it('handles missing local attachment gracefully', async () => {
    const local = createWebLocal();
    const att = makeAttachment('img1', 'canto/j1/attachments/nonexistent.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    await local.saveJournal(journal);

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toContain('p1');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing local attachment'));
    consoleSpy.mockRestore();
  });

  it('multiple pages with attachments sync correctly', async () => {
    const local = createWebLocal();
    const att1 = makeAttachment('img1', '');
    const att2 = makeAttachment('img2', '');
    const p1 = makePage('p1', 1000, false, [att1]);
    const p2 = makePage('p2', 2000, false, [att2]);
    const journal = makeJournal([p1, p2]);
    await local.saveJournal(journal);

    // Save attachments and update paths
    const path1 = await local.saveAttachment('j1', 'p1', att1, 'data1');
    p1.images[0].path = path1;
    await local.savePage('j1', p1, undefined, true);
    const path2 = await local.saveAttachment('j1', 'p2', att2, 'data2');
    p2.images[0].path = path2;
    await local.savePage('j1', p2, undefined, true);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(2);
  });

  it('corrupted remote page does not block other downloads', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(makePage('p1', 1000)));
    drive.putFile('p2.json', pagesFolderId, 'NOT VALID JSON');
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.downloaded).toContain('p1');
    consoleSpy.mockRestore();
  });

  it('full cycle: sync, modify remotely, re-sync downloads changes', async () => {
    const local = createWebLocal();
    const p1 = makePage('p1', 1000);
    const journal = makeJournal([p1]);
    await local.saveJournal(journal);

    const engine = new SyncEngine(local, store);
    const result1 = await engine.sync('j1');
    expect(result1.uploaded).toContain('p1');

    // Simulate remote edit
    const updatedPage = makePage('p1', 5000, false, [], 'Updated remotely');
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    await store2.uploadPage('j1', updatedPage);

    // Re-sync
    const store3 = new GDriveRemoteStore();
    await store3.connect({ accessToken: 'test-token' });
    const engine2 = new SyncEngine(local, store3);
    const result2 = await engine2.sync('j1');

    expect(result2.downloaded).toContain('p1');
    const savedPage = await local.getPage('j1', 'p1');
    expect(savedPage!.text).toBe('Updated remotely');
  });

  // ----- NEW: timestamp preservation tests -----

  it('downloaded page preserves remote timestamp', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const remoteTimestamp = 1234567890;
    const remotePage = makePage('p1', remoteTimestamp);

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    await engine.sync('j1');

    const savedPage = await local.getPage('j1', 'p1');
    expect(savedPage!.modified).toBe(remoteTimestamp);
  });

  it('re-sync after download does not re-upload', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const remotePage = makePage('p1', 5000);
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result1 = await engine.sync('j1');
    expect(result1.downloaded).toContain('p1');

    // Re-sync — page should be in sync now, no uploads
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const engine2 = new SyncEngine(local, store2);
    const result2 = await engine2.sync('j1');

    expect(result2.uploaded).toHaveLength(0);
    expect(result2.downloaded).toHaveLength(0);
  });

  it('journal settings/metadata preserved on remote after sync', async () => {
    const local = createWebLocal();
    const journal = makeJournal([], false, undefined, {
      title: 'Custom Title',
      icon: 'star',
      settings: {
        use24h: true,
        previewTags: false,
        previewThumbnail: false,
        previewIcons: false,
        filterBar: false,
        sort: 'ascending',
        autoLocation: true,
        remoteSync: true,
        syncProvider: 'gdrive',
        autoSync: true,
      },
    });
    await local.saveJournal(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1');

    // Verify metadata is on remote by downloading it via a fresh store
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const remoteResult = await store2.downloadJournalMeta('j1');
    expect(remoteResult!.content.title).toBe('Custom Title');
    expect(remoteResult!.content.icon).toBe('star');
    expect(remoteResult!.content.settings.use24h).toBe(true);
    expect(remoteResult!.content.settings.sort).toBe('ascending');
  });

  it('soft-deleted pages not re-downloaded after sync', async () => {
    const local = createWebLocal();
    const p1 = makePage('p1', 1000);
    const journal = makeJournal([p1]);
    await local.saveJournal(journal);

    // First sync: upload page
    const engine = new SyncEngine(local, store);
    await engine.sync('j1');

    // Delete locally — this marks as deleted with newer timestamp
    await local.deletePage('j1', 'p1');

    // Re-sync — should propagate deletion to remote
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const engine2 = new SyncEngine(local, store2);
    const result = await engine2.sync('j1');

    expect(result.deleted).toContain('p1');

    // Third sync — deleted page should not reappear
    const store3 = new GDriveRemoteStore();
    await store3.connect({ accessToken: 'test-token' });
    const engine3 = new SyncEngine(local, store3);
    const result3 = await engine3.sync('j1');

    expect(result3.downloaded).toHaveLength(0);
  });

  it('multiple journals sync independently', async () => {
    const local = createWebLocal();
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const journal1 = makeJournal([p1], false, undefined, { id: 'j1', title: 'Journal 1' });
    const journal2 = makeJournal([p2], true, 'salt==', { id: 'j2', title: 'Journal 2' });
    await local.saveJournal(journal1);
    const derivedKey = new Uint8Array(32).fill(42);
    await local.saveJournal(journal2, derivedKey);

    const engine = new SyncEngine(local, store);
    const r1 = await engine.sync('j1');
    const r2 = await engine.sync('j2', derivedKey);

    expect(r1.uploaded).toContain('p1');
    expect(r2.uploaded).toContain('p2');

    // Verify independent storage
    const j1 = await local.getJournal('j1');
    const j2 = await local.getJournal('j2', derivedKey);
    expect(j1!.title).toBe('Journal 1');
    expect(j2!.title).toBe('Journal 2');
    expect(j2!.secure).toBe(true);
  });

  // ----- Regression: import-then-sync must not re-upload -----

  it('imported pages saved with preserveModified do not trigger re-upload on sync', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    // Simulate cloud import: download pages from remote, save locally with preserveModified
    const remotePage1 = makePage('p1', 1000, false, [], 'Imported page 1');
    const remotePage2 = makePage('p2', 2000, false, [], 'Imported page 2');

    // Set up remote state (as if another device synced these)
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage1));
    drive.putFile('p2.json', pagesFolderId, JSON.stringify(remotePage2));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    // Simulate import: save pages with preserveModified=true (as NewJournalModal does)
    await local.savePage('j1', remotePage1, undefined, true);
    await local.savePage('j1', remotePage2, undefined, true);

    // Now sync — pages should be in sync (same timestamps), no uploads
    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    expect(result.uploaded).toHaveLength(0);
    expect(result.downloaded).toHaveLength(0);
  });

  it('imported pages saved WITHOUT preserveModified cause unnecessary re-uploads (regression guard)', async () => {
    const local = createWebLocal();
    const emptyJournal = makeJournal([]);
    await local.saveJournal(emptyJournal);

    const remotePage = makePage('p1', 1000, false, [], 'Imported page');

    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    const pagesFolderId = drive.putFolder('pages', jFolderId);
    drive.putFile('meta.json', jFolderId, JSON.stringify(emptyJournal));
    drive.putFile('p1.json', pagesFolderId, JSON.stringify(remotePage));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    // Save WITHOUT preserveModified — modified gets overwritten to Date.now()
    await local.savePage('j1', remotePage, undefined, false);

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1');

    // The local page now has a newer timestamp than remote → triggers unnecessary upload
    expect(result.uploaded).toContain('p1');
  });
});
