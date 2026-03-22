/**
 * Encryption-focused sync tests.
 *
 * Unlike other sync tests that mock aesGcmEncrypt/Decrypt as passthrough,
 * these tests use a deterministic but REAL transformation to verify that:
 *   - Data on GDrive is actually encrypted (not plain JSON)
 *   - Decryption with the correct key recovers original data
 *   - Wrong key fails decryption
 *   - The sync index is stored unencrypted
 *   - Attachments are encrypted
 *   - Non-secure journals (salt-only key) are still encrypted
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

// Use a deterministic but non-identity mock: base64-encode with a key-dependent tag.
// This lets us verify the engine actually calls encrypt/decrypt (output !== input)
// and that decryption with the wrong key fails.
function keyTag(key: Uint8Array): string {
  return Array.from(key.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}
const ENC_PREFIX = 'ENC';
jest.mock('../encryption/utils', () => {
  const actual = jest.requireActual('../encryption/utils');
  return {
    ...actual,
    aesGcmEncrypt: jest.fn((plaintext: string, key: Uint8Array) => {
      const tag = Array.from(key.slice(0, 4), (b: number) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      return Promise.resolve(
        `${ENC_PREFIX}:${tag}:` + btoa(unescape(encodeURIComponent(plaintext))),
      );
    }),
    aesGcmDecrypt: jest.fn((ciphertext: string, key: Uint8Array) => {
      const tag = Array.from(key.slice(0, 4), (b: number) => b.toString(16).padStart(2, '0')).join(
        '',
      );
      const expectedPrefix = `${ENC_PREFIX}:${tag}:`;
      if (!ciphertext.startsWith(expectedPrefix)) {
        return Promise.reject(new Error('Decryption failed: wrong key or corrupted data'));
      }
      return Promise.resolve(
        decodeURIComponent(escape(atob(ciphertext.slice(expectedPrefix.length)))),
      );
    }),
  };
});

const mockedApi = api as jest.Mocked<typeof api>;

const SYNC_KEY = new Uint8Array(32).fill(1);
const WRONG_KEY = new Uint8Array(32).fill(99);

describe('GDrive sync encryption', () => {
  const drive = new InMemoryDrive(mockedApi);
  let store: GDriveRemoteStore;

  beforeEach(async () => {
    drive.setup();
    store = new GDriveRemoteStore();
    await store.connect({ accessToken: 'test-token' });
  });

  it('pages uploaded to GDrive are encrypted (not plain JSON)', async () => {
    const page = makePage('p1', 1000, false, [], 'My secret diary entry');
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // Find the page file in the drive
    const files = drive.dump().filter((f) => f.name === 'p1.json');
    expect(files).toHaveLength(1);

    const storedContent = files[0].content;
    // Stored content should NOT be parseable as JSON (it's encrypted)
    expect(() => JSON.parse(storedContent)).toThrow();
    // It should start with our encrypt prefix
    expect(storedContent).toMatch(/^ENC:01010101:/);
    // The plaintext should NOT appear in the stored content
    expect(storedContent).not.toContain('My secret diary entry');
  });

  it('journal metadata uploaded to GDrive is encrypted', async () => {
    const journal = makeJournal([], false, undefined, { title: 'Secret Journal' });
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // meta.json should be encrypted
    const metaFiles = drive.dump().filter((f) => f.name === 'meta.json');
    expect(metaFiles).toHaveLength(1);
    expect(metaFiles[0].content).toMatch(/^ENC:01010101:/);
    expect(metaFiles[0].content).not.toContain('Secret Journal');
  });

  it('sync index is stored unencrypted (plain JSON)', async () => {
    const page = makePage('p1', 1000);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // index.json should be plain JSON, not encrypted
    const indexFiles = drive.dump().filter((f) => f.name === 'index.json');
    expect(indexFiles).toHaveLength(1);
    const index = JSON.parse(indexFiles[0].content);
    expect(index).toHaveProperty('p1');
    expect(index.p1.modified).toBe(1000);
  });

  it('sync index contains correct timestamps and deleted flags', async () => {
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const p3 = makePage('p3', 3000, true); // deleted
    const journal = makeJournal([p1, p2, p3]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    const indexFiles = drive.dump().filter((f) => f.name === 'index.json');
    const index = JSON.parse(indexFiles[0].content);
    expect(index.p1).toEqual({ modified: 1000 });
    expect(index.p2).toEqual({ modified: 2000 });
    expect(index.p3).toEqual({ modified: 3000, deleted: true });
  });

  it('registry stays unencrypted with journal title and salt', async () => {
    const journal = makeJournal([], true, 'c2VjcmV0c2FsdA==', { title: 'My Diary' });
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    const registryFiles = drive.dump().filter((f) => f.name === 'canto-journals.json');
    expect(registryFiles).toHaveLength(1);
    const registry = JSON.parse(registryFiles[0].content);
    expect(registry).toHaveLength(1);
    expect(registry[0].title).toBe('My Diary');
    expect(registry[0].salt).toBe('c2VjcmV0c2FsdA==');
    expect(registry[0].encrypted).toBe(true);
  });

  it('encrypted round-trip: upload then download recovers original data', async () => {
    const page = makePage('p1', 1000, false, [], 'Round-trip content 🎉');
    const journal = makeJournal([page]);
    const localA = createMockLocalStore(journal);

    // Device A syncs up
    const engineA = new SyncEngine(localA, store);
    await engineA.sync('j1', SYNC_KEY);

    // Device B syncs down
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const localB = createMockLocalStore(makeJournal([]));
    const engineB = new SyncEngine(localB, store2);
    const result = await engineB.sync('j1', SYNC_KEY);

    expect(result.downloaded).toContain('p1');
    // Verify local.savePage was called with the decrypted page
    expect(localB.savePage).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({
        id: 'p1',
        text: 'Round-trip content 🎉',
        modified: 1000,
      }),
      SYNC_KEY,
      true,
    );
  });

  it('wrong key fails to decrypt remote pages (gracefully skipped)', async () => {
    const page = makePage('p1', 1000, false, [], 'Secret');
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    // Upload with correct key
    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // Try to download with wrong key
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const localWrong = createMockLocalStore(makeJournal([]));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const engineWrong = new SyncEngine(localWrong, store2);
    const result = await engineWrong.sync('j1', WRONG_KEY);

    // Page download should fail gracefully (wrong key can't decrypt)
    expect(result.downloaded).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to download page p1'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('non-secure journal still gets encrypted on GDrive', async () => {
    const page = makePage('p1', 1000, false, [], 'Not password-protected but still encrypted');
    const journal = makeJournal([page], false); // secure=false
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // Page should still be encrypted on GDrive
    const pageFiles = drive.dump().filter((f) => f.name === 'p1.json');
    expect(pageFiles[0].content).toMatch(/^ENC:01010101:/);
    expect(pageFiles[0].content).not.toContain('Not password-protected');
  });

  it('attachments are encrypted before upload', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    const engine = new SyncEngine(local, store);
    await engine.sync('j1', SYNC_KEY);

    // Find the attachment file in the drive
    const attFiles = drive.dump().filter((f) => f.name === 'img1.png');
    expect(attFiles).toHaveLength(1);
    // Attachment data should be encrypted
    expect(attFiles[0].content).toMatch(/^ENC:01010101:/);
    expect(attFiles[0].content).not.toBe('base64imagedata');
  });

  it('attachments are decrypted after download', async () => {
    const att = makeAttachment('img1', '/local/files/img1.png');
    const page = makePage('p1', 1000, false, [att]);
    const journal = makeJournal([page]);
    const localA = createMockLocalStore(journal);

    // Upload
    const engineA = new SyncEngine(localA, store);
    await engineA.sync('j1', SYNC_KEY);

    // Download on device B
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const localB = createMockLocalStore(makeJournal([]));
    const engineB = new SyncEngine(localB, store2);
    await engineB.sync('j1', SYNC_KEY);

    // saveAttachment should have been called with the DECRYPTED data
    expect(localB.saveAttachment).toHaveBeenCalledWith(
      'j1',
      'p1',
      expect.objectContaining({ id: 'img1' }),
      'base64imagedata', // original unencrypted data
    );
  });

  it('engine only downloads pages that differ from sync index (no unnecessary fetches)', async () => {
    const p1 = makePage('p1', 1000);
    const p2 = makePage('p2', 2000);
    const journal = makeJournal([p1, p2]);
    const local = createMockLocalStore(journal);

    // First sync: uploads both pages
    const engine1 = new SyncEngine(local, store);
    await engine1.sync('j1', SYNC_KEY);

    // Second sync: nothing changed, should not call downloadPage at all
    const store2 = new GDriveRemoteStore();
    await store2.connect({ accessToken: 'test-token' });
    const downloadPageSpy = jest.spyOn(store2, 'downloadPage');

    const engine2 = new SyncEngine(local, store2);
    const result = await engine2.sync('j1', SYNC_KEY);

    expect(result.uploaded).toHaveLength(0);
    expect(result.downloaded).toHaveLength(0);
    expect(downloadPageSpy).not.toHaveBeenCalled();
  });

  it('missing sync index is treated as empty remote (all local pages uploaded)', async () => {
    const page = makePage('p1', 1000);
    const journal = makeJournal([page]);
    const local = createMockLocalStore(journal);

    // Manually set up remote with meta but NO index.json
    const rootId = drive.putFolder('Canto');
    const jFolderId = drive.putFolder('j1', rootId);
    drive.putFile('meta.json', jFolderId, 'ENC:' + keyTag(SYNC_KEY) + ':' + btoa('{}'));
    drive.putFile(
      'canto-journals.json',
      'appData',
      JSON.stringify([{ id: 'j1', title: 'My Journal', encrypted: false }]),
    );

    const engine = new SyncEngine(local, store);
    const result = await engine.sync('j1', SYNC_KEY);

    // With no index, engine treats remote as empty → uploads local page
    expect(result.uploaded).toContain('p1');
  });
});
