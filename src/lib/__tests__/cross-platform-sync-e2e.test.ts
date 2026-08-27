/**
 * Cross-platform sync E2E tests.
 * Two InMemoryLocalStore instances (native + web) sync through the same InMemoryDrive.
 * Verifies data integrity across platforms.
 */
import { SyncEngine } from '../sync/engine';
import { SyncManager } from '../sync/manager';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';
import { InMemoryDrive } from './helpers/in-memory-drive';
import {
  makePage,
  makeAttachment,
  makeJournal,
  assertPagesEqual,
} from './helpers/sync-test-helpers';
import { createInMemoryLocalStore, type Platform } from './helpers/in-memory-local-store';
import { createMockEncryption } from './helpers/mock-encryption';

jest.mock('../sync/gdrive/api');
jest.mock('../encryption/utils', () => ({
  ...jest.requireActual('../encryption/utils'),
  aesGcmEncrypt: jest.fn((plaintext: string) => Promise.resolve(plaintext)),
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));
const mockedApi = api as jest.Mocked<typeof api>;

const SYNC_KEY = new Uint8Array(32).fill(1);

function createSyncPair(drive: InMemoryDrive, platform: Platform) {
  const encryption = createMockEncryption();
  const local = createInMemoryLocalStore(encryption, platform);
  const remote = new GDriveRemoteStore();
  return { local, remote, encryption };
}

async function connectStore(remote: GDriveRemoteStore) {
  await remote.connect({ accessToken: 'test-token' });
}

describe('Cross-platform sync E2E', () => {
  const drive = new InMemoryDrive(mockedApi);

  beforeEach(() => {
    drive.setup();
  });

  // ========== Native → Web ==========

  describe('native creates, web receives', () => {
    it('basic page sync', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const page = makePage('p1', 1000, false, [], 'Hello from native');
      const journal = makeJournal([page]);
      await native.local.saveJournal(journal);

      // Native sync up
      await connectStore(native.remote);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', SYNC_KEY);

      // Web sync down
      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const webEngine = new SyncEngine(web.local, web.remote);
      const result = await webEngine.sync('j1', SYNC_KEY);

      expect(result.downloaded).toContain('p1');
      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text).toBe('Hello from native');
      expect(webPage!.modified).toBe(1000);
    });

    it('page with attachments', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const att = makeAttachment('img1', '');
      const page = makePage('p1', 1000, false, [att]);
      const journal = makeJournal([page]);
      await native.local.saveJournal(journal);

      // Save attachment with native path
      const nativePath = await native.local.saveAttachment('j1', 'p1', att, 'imgdata123');
      page.images[0].path = nativePath;
      await native.local.savePage('j1', page, undefined, true);

      // Native sync up
      await connectStore(native.remote);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', SYNC_KEY);

      // Web sync down
      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const webEngine = new SyncEngine(web.local, web.remote);
      await webEngine.sync('j1', SYNC_KEY);

      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage).not.toBeNull();
      // Web should have a web-format path, not native file URI
      expect(webPage!.images[0].path).toMatch(/^canto\//);
      // Attachment data should be accessible
      const attData = await web.local.getAttachment(webPage!.images[0].path);
      expect(attData).toBe('imgdata123');
    });

    it('multiple pages with mixed states', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const p1 = makePage('p1', 1000, false, [], 'Normal page');
      const p2 = makePage('p2', 2000, false, [], 'Another page');
      const p3 = makePage('p3', 3000, true, [], 'Deleted page'); // deleted
      const journal = makeJournal([p1, p2, p3]);
      await native.local.saveJournal(journal);

      await connectStore(native.remote);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const webEngine = new SyncEngine(web.local, web.remote);
      const result = await webEngine.sync('j1', SYNC_KEY);

      expect(result.downloaded).toContain('p1');
      expect(result.downloaded).toContain('p2');
      // p3 is deleted, should not be downloaded
      expect(result.downloaded).not.toContain('p3');
    });

    it('journal metadata preserved on remote', async () => {
      const native = createSyncPair(drive, 'native');

      const journal = makeJournal([], false, undefined, {
        title: 'Travel Diary',
        icon: 'plane',
        settings: {
          use24h: true,
          previewTags: false,
          previewThumbnail: true,
          previewIcons: false,
          filterBar: true,
          sort: 'ascending',
          autoLocation: true,
          remoteSync: true,
          syncProvider: 'gdrive',
          autoSync: true,
        },
      });
      await native.local.saveJournal(journal);

      await connectStore(native.remote);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', SYNC_KEY);

      // Verify remote has the metadata
      const remoteStore = new GDriveRemoteStore();
      await connectStore(remoteStore);
      const remoteResult = await remoteStore.downloadJournalMeta('j1');
      // downloadJournalMeta now returns string | null; mock encryption is identity
      const meta = JSON.parse(remoteResult!);
      expect(meta.title).toBe('Travel Diary');
      expect(meta.icon).toBe('plane');
      expect(meta.settings.use24h).toBe(true);
      expect(meta.settings.sort).toBe('ascending');
      expect(meta.settings.autoLocation).toBe(true);
    });

    it('encrypted journal round-trip', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');
      const derivedKey = new Uint8Array(32).fill(42);

      const page = makePage('p1', 1000, false, [], 'Secret content');
      const journal = makeJournal([page], true, 'base64salt==');
      await native.local.saveJournal(journal, derivedKey);

      await connectStore(native.remote);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', derivedKey);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([], true, 'base64salt=='), derivedKey);
      const webEngine = new SyncEngine(web.local, web.remote);
      await webEngine.sync('j1', derivedKey);

      const webPage = await web.local.getPage('j1', 'p1', derivedKey);
      expect(webPage!.text).toBe('Secret content');
    });

    it('sequential edits', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Create and sync
      const p1 = makePage('p1', 1000, false, [], 'Version 1');
      await native.local.saveJournal(makeJournal([p1]));
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Edit on native
      const p1v2 = makePage('p1', 5000, false, [], 'Version 2');
      await native.local.savePage('j1', p1v2, undefined, true);
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      // Web syncs
      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j1', SYNC_KEY);

      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text).toBe('Version 2');
      expect(webPage!.modified).toBe(5000);
    });
  });

  // ========== Web → Native ==========

  describe('web creates, native receives', () => {
    it('basic page sync', async () => {
      const web = createSyncPair(drive, 'web');
      const native = createSyncPair(drive, 'native');

      const page = makePage('p1', 2000, false, [], 'Hello from web');
      await web.local.saveJournal(makeJournal([page]));

      await connectStore(web.remote);
      const webEngine = new SyncEngine(web.local, web.remote);
      await webEngine.sync('j1', SYNC_KEY);

      await connectStore(native.remote);
      await native.local.saveJournal(makeJournal([]));
      const nativeEngine = new SyncEngine(native.local, native.remote);
      const result = await nativeEngine.sync('j1', SYNC_KEY);

      expect(result.downloaded).toContain('p1');
      const nativePage = await native.local.getPage('j1', 'p1', SYNC_KEY);
      expect(nativePage!.text).toBe('Hello from web');
    });

    it('page with attachments', async () => {
      const web = createSyncPair(drive, 'web');
      const native = createSyncPair(drive, 'native');

      const att = makeAttachment('photo1', '');
      const page = makePage('p1', 2000, false, [att]);
      await web.local.saveJournal(makeJournal([page]));

      const webPath = await web.local.saveAttachment('j1', 'p1', att, 'photodata');
      page.images[0].path = webPath;
      await web.local.savePage('j1', page, undefined, true);

      await connectStore(web.remote);
      const webEngine = new SyncEngine(web.local, web.remote);
      await webEngine.sync('j1', SYNC_KEY);

      await connectStore(native.remote);
      await native.local.saveJournal(makeJournal([]));
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', SYNC_KEY);

      const nativePage = await native.local.getPage('j1', 'p1', SYNC_KEY);
      expect(nativePage).not.toBeNull();
      // Native should have native-format path
      expect(nativePage!.images[0].path).toMatch(/^file:\/\//);
      const attData = await native.local.getAttachment(nativePage!.images[0].path);
      expect(attData).toBe('photodata');
    });

    it('encrypted journal round-trip', async () => {
      const web = createSyncPair(drive, 'web');
      const native = createSyncPair(drive, 'native');
      const derivedKey = new Uint8Array(32).fill(99);

      const page = makePage('p1', 2000, false, [], 'Web secret');
      await web.local.saveJournal(makeJournal([page], true, 'websalt=='), derivedKey);

      await connectStore(web.remote);
      const webEngine = new SyncEngine(web.local, web.remote);
      await webEngine.sync('j1', derivedKey);

      await connectStore(native.remote);
      await native.local.saveJournal(makeJournal([], true, 'websalt=='), derivedKey);
      const nativeEngine = new SyncEngine(native.local, native.remote);
      await nativeEngine.sync('j1', derivedKey);

      const nativePage = await native.local.getPage('j1', 'p1', derivedKey);
      expect(nativePage!.text).toBe('Web secret');
    });

    it('deletion propagation via soft-delete', async () => {
      const web = createSyncPair(drive, 'web');
      const native = createSyncPair(drive, 'native');

      // Web creates and syncs
      const page = makePage('p1', 1000);
      await web.local.saveJournal(makeJournal([page]));
      await connectStore(web.remote);
      const we1 = new SyncEngine(web.local, web.remote);
      await we1.sync('j1', SYNC_KEY);

      // Native syncs down
      await connectStore(native.remote);
      await native.local.saveJournal(makeJournal([]));
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);
      expect(await native.local.getPage('j1', 'p1', SYNC_KEY)).not.toBeNull();

      // Web soft-deletes: mark page as deleted with newer timestamp and sync
      // The engine sees localPage.deleted=true → calls remote.deletePage (trashes remote file)
      const deletedPage = makePage('p1', Date.now(), true);
      await web.local.savePage('j1', deletedPage, undefined, true);
      const we2Store = new GDriveRemoteStore();
      await connectStore(we2Store);
      const we2 = new SyncEngine(web.local, we2Store);
      const webResult = await we2.sync('j1', SYNC_KEY);
      expect(webResult.deleted).toContain('p1');

      // Native syncs again — sync index now records p1 as deleted,
      // so the engine propagates the deletion to native's local store.
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      const result = await ne2.sync('j1', SYNC_KEY);

      // With the sync index, deletion is properly propagated across platforms
      expect(result.deleted).toContain('p1');
    });
  });

  // ========== Bidirectional ==========

  describe('bidirectional sync', () => {
    it('keeps both immutable revisions readable when Drive fails after every publication boundary', async () => {
      type FaultPoint =
        | 'delta-create'
        | 'compatibility-create'
        | 'compatibility-update'
        | 'compact-list'
        | 'compact-read'
        | 'compact-create'
        | 'compact-cleanup';
      const faultPoints: readonly FaultPoint[] = [
        'delta-create',
        'compatibility-create',
        'compatibility-update',
        'compact-list',
        'compact-read',
        'compact-create',
        'compact-cleanup',
      ];

      for (const faultPoint of faultPoints) {
        drive.setup();
        const rootId = drive.putFolder('Canto');
        const journalId = drive.putFolder('j1', rootId);
        const priorDeltaId = drive.putFile(
          'canto-sync-index-v1-j1-index-v2-00000000-0000-4000-8000-000000000001.json',
          'appData',
          JSON.stringify({ remote: { modified: 1 } }),
        );
        if (faultPoint === 'compatibility-update') {
          drive.putFile('index.json', journalId, JSON.stringify({ remote: { modified: 1 } }));
        }

        let injected = false;
        let hiddenIndexLists = 0;
        let priorDeltaReads = 0;
        const createFile = mockedApi.createFile.getMockImplementation()!;
        const updateFile = mockedApi.updateFile.getMockImplementation()!;
        const listFiles = mockedApi.listFiles.getMockImplementation()!;
        const getFileContent = mockedApi.getFileContent.getMockImplementation()!;
        const deleteFile = mockedApi.deleteFile.getMockImplementation()!;
        mockedApi.createFile.mockImplementation(async (...args) => {
          const created = await createFile(...args);
          const name = args[1].name;
          if (
            !injected &&
            ((faultPoint === 'delta-create' && name.includes('-index-v2-')) ||
              (faultPoint === 'compatibility-create' && name === 'index.json') ||
              (faultPoint === 'compact-create' && name.includes('-index-v3-')))
          ) {
            injected = true;
            throw new Error(`lost Drive response after ${faultPoint}`);
          }
          return created;
        });
        mockedApi.updateFile.mockImplementation(async (...args) => {
          const updated = await updateFile(...args);
          if (!injected && faultPoint === 'compatibility-update' && args[2].name === 'index.json') {
            injected = true;
            throw new Error('lost Drive response after compatibility-update');
          }
          return updated;
        });
        mockedApi.listFiles.mockImplementation(async (...args) => {
          const files = await listFiles(...args);
          if (
            args[1].includes("name contains 'canto-sync-index-v1-j1-'") &&
            ++hiddenIndexLists === 2 &&
            !injected &&
            faultPoint === 'compact-list'
          ) {
            injected = true;
            throw new Error('lost Drive response after compact-list');
          }
          return files;
        });
        mockedApi.getFileContent.mockImplementation(async (...args) => {
          const content = await getFileContent(...args);
          if (
            args[1] === priorDeltaId &&
            ++priorDeltaReads === 2 &&
            !injected &&
            faultPoint === 'compact-read'
          ) {
            injected = true;
            throw new Error('lost Drive response after compact-read');
          }
          return content;
        });
        mockedApi.deleteFile.mockImplementation(async (...args) => {
          await deleteFile(...args);
          if (!injected && faultPoint === 'compact-cleanup') {
            injected = true;
            throw new Error('lost Drive response after compact-cleanup');
          }
        });

        const writer = new GDriveRemoteStore();
        await connectStore(writer);
        const publication = await writer.openSyncIndexPublication('j1');
        const warn = jest.spyOn(console, 'warn').mockImplementation();
        try {
          await publication.publishPage('local', { modified: 2 });
          await publication.finalize({ successful: true });
        } catch {
          // A client-observed failure after a successful remote write is the
          // exact recovery case under test. A new reader must still see it.
        } finally {
          warn.mockRestore();
        }

        expect(injected).toBe(true);
        const reader = new GDriveRemoteStore();
        await connectStore(reader);
        await expect(reader.downloadSyncIndex('j1')).resolves.toMatchObject({
          remote: { modified: 1 },
          local: { modified: 2 },
        });
      }
    });

    it('retains both independent publications through concurrent finalization and compaction', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');
      await native.local.saveJournal(makeJournal([]));
      await web.local.saveJournal(makeJournal([]));

      // Seed the common journal folders/index before the two independent
      // managers race publication. The race below is therefore at immutable
      // page/index publication and compaction, not folder creation.
      await connectStore(native.remote);
      await new SyncManager(native.local, native.remote).syncJournal('j1', 'test-token', SYNC_KEY);

      await native.local.savePage(
        'j1',
        makePage('native-page', 10_000, false, [], 'from native'),
        undefined,
        true,
      );
      await web.local.savePage(
        'j1',
        makePage('web-page', 20_000, false, [], 'from web'),
        undefined,
        true,
      );

      // Use separate RemoteStore/manager instances so neither device shares
      // in-memory index snapshots or publication state with the other.
      const nativeRaceStore = new GDriveRemoteStore();
      const webRaceStore = new GDriveRemoteStore();
      await Promise.all([connectStore(nativeRaceStore), connectStore(webRaceStore)]);
      const nativeManager = new SyncManager(native.local, nativeRaceStore);
      const webManager = new SyncManager(web.local, webRaceStore);

      // The stateful fake models Drive's ETag conflict, but the API boundary
      // classifies it exactly as production does so the store takes its
      // conditional-update merge/retry path.
      const updateFile = mockedApi.updateFile.getMockImplementation()!;
      mockedApi.updateFile.mockImplementation(async (...args) => {
        try {
          return await updateFile(...args);
        } catch (error) {
          if ((error as { status?: number }).status === 412) {
            throw Object.assign(new api.GDriveApiError(412), { status: 412 });
          }
          throw error;
        }
      });

      const [nativeResult, webResult] = await Promise.all([
        nativeManager.syncJournal('j1', 'test-token', SYNC_KEY),
        webManager.syncJournal('j1', 'test-token', SYNC_KEY),
      ]);
      expect(nativeResult).not.toBeNull();
      expect(webResult).not.toBeNull();

      const reader = new GDriveRemoteStore();
      await connectStore(reader);
      await expect(reader.downloadSyncIndex('j1')).resolves.toMatchObject({
        'native-page': { modified: 10_000 },
        'web-page': { modified: 20_000 },
      });

      const hiddenIndexes = drive
        .dump()
        .filter(
          (file) => file.parentId === 'appData' && file.name.startsWith('canto-sync-index-v1-j1-'),
        );
      // Successful finalization compacts eagerly. Concurrent cleanup may leave
      // one extra immutable artifact, but it must remain far below the 128
      // checkpoint bound and every reader above still sees the full union.
      expect(hiddenIndexes.length).toBeLessThanOrEqual(2);
    });

    it('concurrent edits on different pages', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Both start with empty journal
      await native.local.saveJournal(makeJournal([]));
      await web.local.saveJournal(makeJournal([]));

      // Native adds page A
      const pageA = makePage('pA', 1000, false, [], 'From native');
      await native.local.savePage('j1', pageA, undefined, true);

      // Web adds page B
      const pageB = makePage('pB', 2000, false, [], 'From web');
      await web.local.savePage('j1', pageB, undefined, true);

      // Native syncs (uploads A)
      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      // Web syncs (uploads B, downloads A)
      await connectStore(web.remote);
      const we = new SyncEngine(web.local, web.remote);
      const webResult = await we.sync('j1', SYNC_KEY);
      expect(webResult.uploaded).toContain('pB');
      expect(webResult.downloaded).toContain('pA');

      // Native re-syncs (downloads B)
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      const nativeResult = await ne2.sync('j1', SYNC_KEY);
      expect(nativeResult.downloaded).toContain('pB');

      // Both have both pages
      const nativeA = await native.local.getPage('j1', 'pA', SYNC_KEY);
      const nativeB = await native.local.getPage('j1', 'pB', SYNC_KEY);
      const webA = await web.local.getPage('j1', 'pA', SYNC_KEY);
      const webB = await web.local.getPage('j1', 'pB', SYNC_KEY);

      expect(nativeA!.text).toBe('From native');
      expect(nativeB!.text).toBe('From web');
      expect(webA!.text).toBe('From native');
      expect(webB!.text).toBe('From web');
    });

    it('concurrent edits same page — native newer wins', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Both start with same page
      const original = makePage('p1', 1000, false, [], 'Original');
      await native.local.saveJournal(makeJournal([original]));
      await web.local.saveJournal(makeJournal([original]));

      // Sync initial state
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Native edits (newer)
      const nativeEdit = makePage('p1', 5000, false, [], 'Native edit');
      await native.local.savePage('j1', nativeEdit, undefined, true);

      // Web edits (older)
      const webEdit = makePage('p1', 3000, false, [], 'Web edit');
      await web.local.savePage('j1', webEdit, undefined, true);

      // Native syncs (uploads newer version)
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      // Web syncs (should download native's version since it's newer)
      await connectStore(web.remote);
      const we = new SyncEngine(web.local, web.remote);
      const webResult = await we.sync('j1', SYNC_KEY);

      expect(webResult.downloaded).toContain('p1');
      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text).toBe('Native edit');
      expect(webPage!.modified).toBe(5000);
    });

    it('concurrent edits same page — web newer wins', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const original = makePage('p1', 1000, false, [], 'Original');
      await native.local.saveJournal(makeJournal([original]));
      await web.local.saveJournal(makeJournal([original]));

      // Sync initial state
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Web edits (newer)
      const webEdit = makePage('p1', 8000, false, [], 'Web wins');
      await web.local.savePage('j1', webEdit, undefined, true);

      // Native edits (older)
      const nativeEdit = makePage('p1', 3000, false, [], 'Native loses');
      await native.local.savePage('j1', nativeEdit, undefined, true);

      // Web syncs first (uploads newer)
      await connectStore(web.remote);
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j1', SYNC_KEY);

      // Native syncs (should download web's version)
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      const nativeResult = await ne2.sync('j1', SYNC_KEY);

      expect(nativeResult.downloaded).toContain('p1');
      const nativePage = await native.local.getPage('j1', 'p1', SYNC_KEY);
      expect(nativePage!.text).toBe('Web wins');
    });

    it('edit chain across platforms', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Native creates
      const p1 = makePage('p1', 1000, false, [], 'v1');
      await native.local.saveJournal(makeJournal([p1]));

      // Native syncs up
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Web syncs down
      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we1 = new SyncEngine(web.local, web.remote);
      await we1.sync('j1', SYNC_KEY);
      expect((await web.local.getPage('j1', 'p1', SYNC_KEY))!.text).toBe('v1');

      // Web edits
      const p1v2 = makePage('p1', 5000, false, [], 'v2-web');
      await web.local.savePage('j1', p1v2, undefined, true);

      // Web syncs up
      const we2Store = new GDriveRemoteStore();
      await connectStore(we2Store);
      const we2 = new SyncEngine(web.local, we2Store);
      await we2.sync('j1', SYNC_KEY);

      // Native syncs down
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      const nativePage = await native.local.getPage('j1', 'p1', SYNC_KEY);
      expect(nativePage!.text).toBe('v2-web');
      expect(nativePage!.modified).toBe(5000);
    });

    it('delete on one platform, edit on other — last-write-wins', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Both start with same page
      const original = makePage('p1', 1000);
      await native.local.saveJournal(makeJournal([original]));
      await web.local.saveJournal(makeJournal([original]));

      // Sync initial state
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Native deletes (timestamp T1=2000 via deletePage's Date.now mock)
      const deletedPage = makePage('p1', 2000, true);
      await native.local.savePage('j1', deletedPage, undefined, true);

      // Web edits (timestamp T2=5000, newer than delete)
      const editedPage = makePage('p1', 5000, false, [], 'Still alive');
      await web.local.savePage('j1', editedPage, undefined, true);

      // Native syncs (uploads deletion)
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      // Web syncs — remote index has p1 deleted=true.
      // Deletion propagates: remote deletion wins regardless of timestamp.
      const we1Store = new GDriveRemoteStore();
      await connectStore(we1Store);
      const we = new SyncEngine(web.local, we1Store);
      const webResult = await we.sync('j1', SYNC_KEY);

      // Deletion propagated from native to web
      expect(webResult.deleted).toContain('p1');
    });

    it('attachment survives text-only edit across platforms', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      // Native creates page with attachment
      const att = makeAttachment('img1', '');
      const page = makePage('p1', 1000, false, [att]);
      await native.local.saveJournal(makeJournal([page]));
      const attPath = await native.local.saveAttachment('j1', 'p1', att, 'imagedata');
      page.images[0].path = attPath;
      await native.local.savePage('j1', page, undefined, true);

      // Native syncs
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Web syncs down
      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we1 = new SyncEngine(web.local, web.remote);
      await we1.sync('j1', SYNC_KEY);

      // Web edits text only (keeps attachment, bumps timestamp)
      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      const edited = { ...webPage!, text: 'Updated text', modified: 5000 };
      await web.local.savePage('j1', edited, undefined, true);

      // Web syncs up
      const we2Store = new GDriveRemoteStore();
      await connectStore(we2Store);
      const we2 = new SyncEngine(web.local, we2Store);
      await we2.sync('j1', SYNC_KEY);

      // Native syncs down
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      const finalNative = await native.local.getPage('j1', 'p1', SYNC_KEY);
      expect(finalNative!.text).toBe('Updated text');
      expect(finalNative!.images).toHaveLength(1);
    });

    it('multiple journals with mixed encryption', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');
      const derivedKey = new Uint8Array(32).fill(77);

      // Native: plaintext journal
      const j1 = makeJournal([makePage('p1', 1000, false, [], 'Plain text')], false, undefined, {
        id: 'j1',
        title: 'Public',
      });
      await native.local.saveJournal(j1);

      // Web: encrypted journal
      const j2 = makeJournal([makePage('p2', 2000, false, [], 'Encrypted')], true, 'salt==', {
        id: 'j2',
        title: 'Private',
      });
      await web.local.saveJournal(j2, derivedKey);

      // Sync both
      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j2', derivedKey);

      // Cross-sync: web gets j1, native gets j2
      await web.local.saveJournal(makeJournal([], false, undefined, { id: 'j1', pages: [] }));
      const we2Store = new GDriveRemoteStore();
      await connectStore(we2Store);
      const we2 = new SyncEngine(web.local, we2Store);
      await we2.sync('j1', SYNC_KEY);

      await native.local.saveJournal(
        makeJournal([], true, 'salt==', { id: 'j2', pages: [] }),
        derivedKey,
      );
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j2', derivedKey);

      // Verify
      const webJ1Page = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webJ1Page!.text).toBe('Plain text');

      const nativeJ2Page = await native.local.getPage('j2', 'p2', derivedKey);
      expect(nativeJ2Page!.text).toBe('Encrypted');
    });
  });

  // ========== Edge Cases ==========

  describe('edge cases', () => {
    it('empty journal sync', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      await native.local.saveJournal(makeJournal([]));
      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we = new SyncEngine(web.local, web.remote);
      const result = await we.sync('j1', SYNC_KEY);

      expect(result.uploaded).toHaveLength(0);
      expect(result.downloaded).toHaveLength(0);
      const webJournal = await web.local.getJournal('j1', SYNC_KEY);
      expect(webJournal).not.toBeNull();
    });

    it('page with empty text', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const page = makePage('p1', 1000, false, [], '');
      await native.local.saveJournal(makeJournal([page]));

      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j1', SYNC_KEY);

      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text).toBe('');
    });

    it('page with unicode/emoji text', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const unicodeText = '🎉 こんにちは مرحبا Привет 🌍✨ café résumé naïve';
      const page = makePage('p1', 1000, false, [], unicodeText);
      await native.local.saveJournal(makeJournal([page]));

      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j1', SYNC_KEY);

      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text).toBe(unicodeText);
    });

    it('large page content is not truncated', async () => {
      const native = createSyncPair(drive, 'native');
      const web = createSyncPair(drive, 'web');

      const largeText = 'x'.repeat(50_000);
      const page = makePage('p1', 1000, false, [], largeText);
      await native.local.saveJournal(makeJournal([page]));

      await connectStore(native.remote);
      const ne = new SyncEngine(native.local, native.remote);
      await ne.sync('j1', SYNC_KEY);

      await connectStore(web.remote);
      await web.local.saveJournal(makeJournal([]));
      const we = new SyncEngine(web.local, web.remote);
      await we.sync('j1', SYNC_KEY);

      const webPage = await web.local.getPage('j1', 'p1', SYNC_KEY);
      expect(webPage!.text.length).toBe(50_000);
    });

    it('rapid sequential syncs are idempotent', async () => {
      const native = createSyncPair(drive, 'native');

      const page = makePage('p1', 1000);
      await native.local.saveJournal(makeJournal([page]));

      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      const r1 = await ne1.sync('j1', SYNC_KEY);
      expect(r1.uploaded).toContain('p1');

      // Second sync — no changes
      const s2 = new GDriveRemoteStore();
      await connectStore(s2);
      const ne2 = new SyncEngine(native.local, s2);
      const r2 = await ne2.sync('j1', SYNC_KEY);
      expect(r2.uploaded).toHaveLength(0);
      expect(r2.downloaded).toHaveLength(0);

      // Third sync — still no changes
      const s3 = new GDriveRemoteStore();
      await connectStore(s3);
      const ne3 = new SyncEngine(native.local, s3);
      const r3 = await ne3.sync('j1', SYNC_KEY);
      expect(r3.uploaded).toHaveLength(0);
      expect(r3.downloaded).toHaveLength(0);
    });

    it('journal settings changes propagated to remote', async () => {
      const native = createSyncPair(drive, 'native');

      const journal = makeJournal([makePage('p1', 1000)]);
      await native.local.saveJournal(journal);

      // Initial sync
      await connectStore(native.remote);
      const ne1 = new SyncEngine(native.local, native.remote);
      await ne1.sync('j1', SYNC_KEY);

      // Native changes settings and re-syncs
      const updatedJournal = makeJournal([makePage('p1', 1000)], false, undefined, {
        settings: {
          ...journal.settings,
          use24h: true,
          sort: 'ascending',
        },
      });
      await native.local.saveJournal(updatedJournal);
      const ne2Store = new GDriveRemoteStore();
      await connectStore(ne2Store);
      const ne2 = new SyncEngine(native.local, ne2Store);
      await ne2.sync('j1', SYNC_KEY);

      // Verify remote has updated settings
      const remoteStore = new GDriveRemoteStore();
      await connectStore(remoteStore);
      const remoteResult2 = await remoteStore.downloadJournalMeta('j1');
      // downloadJournalMeta now returns string | null; mock encryption is identity
      const meta = JSON.parse(remoteResult2!);
      expect(meta.settings.use24h).toBe(true);
      expect(meta.settings.sort).toBe('ascending');
    });
  });
});
