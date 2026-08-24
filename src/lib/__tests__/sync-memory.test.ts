import type { Attachment, JournalContent, Page } from 'canto-data';
import { SyncEngine } from '../sync/engine';
import type { LocalStore } from '../storage/types';
import type { RemoteStore } from '../sync/types';
import { createFile } from '../sync/gdrive/api';

// The engine test is intentionally passthrough: this measures references held by
// the sync orchestration, not the platform WebCrypto allocator.
jest.mock('../encryption/utils', () => ({
  aesGcmEncrypt: jest.fn(async (value: string) => value),
  aesGcmDecrypt: jest.fn(async (value: string) => value),
}));

const CHUNK_BYTES = 512 * 1024;
const CHUNK_COUNT = 96;

function makeJournal(): JournalContent {
  const attachment: Attachment = {
    id: 'attachment-1',
    path: 'canto/journal-1/attachments/attachment-1',
    name: 'large-video.mp4',
    type: 'file',
    size: CHUNK_BYTES * CHUNK_COUNT,
    encrypted: false,
    deleted: false,
    content: {
      format: 'canto-chunked-v1',
      byteLength: CHUNK_BYTES * CHUNK_COUNT,
      chunkSize: CHUNK_BYTES,
      chunkCount: CHUNK_COUNT,
      generation: 'generation-1',
    },
  };
  const page: Page = {
    id: 'page-1',
    text: '',
    date: '2026-01-01',
    tags: [],
    files: [attachment],
    images: [],
    comments: [],
    modified: 1,
    deleted: false,
  };
  return {
    id: 'journal-1',
    title: 'Memory fixture',
    icon: 'book',
    date: '2026-01-01',
    secure: false,
    salt: 'salt',
    pages: [page],
    settings: {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
      autoLocation: false,
      remoteSync: true,
      autoSync: false,
    },
    version: 1,
  };
}

describe('SyncEngine bounded chunk reference loop', () => {
  it('does not retain chunk payloads across a 48 MiB chunked upload', async () => {
    const journal = makeJournal();
    const forceGc = (global as typeof globalThis & { gc?: () => void }).gc;
    forceGc?.();
    const before = process.memoryUsage();
    const activePayloads = new Set<string>();
    let peakActivePayloads = 0;
    let generated = 0;
    let uploaded = 0;

    const local = {
      getJournal: jest.fn().mockResolvedValue(journal),
      forEachAttachmentChunk: jest.fn(async (_attachment, visitor) => {
        for (let index = 0; index < CHUNK_COUNT; index++) {
          // Buffer creates a flat, materialized string (rather than a V8 rope),
          // so every iteration represents a real 512 KiB chunk payload.
          const payload = Buffer.alloc(CHUNK_BYTES, index).toString('base64');
          generated++;
          await visitor(index, payload);
        }
      }),
    } as unknown as LocalStore;

    const remote = {
      provider: 'gdrive',
      isRemotePath: () => false,
      buildRemotePath: () => '',
      listRemoteJournals: async () => [],
      downloadSyncIndex: async () => null,
      uploadAttachmentChunk: async (
        _journalId: string,
        _attachmentId: string,
        _generation: string | undefined,
        _index: number,
        payload: string,
      ) => {
        activePayloads.add(payload);
        peakActivePayloads = Math.max(peakActivePayloads, activePayloads.size);
        await Promise.resolve();
        uploaded++;
        activePayloads.delete(payload);
      },
      uploadPage: async () => undefined,
      uploadJournalMeta: async () => undefined,
      uploadSyncIndex: async () => undefined,
    } as unknown as RemoteStore;

    const result = await new SyncEngine(local, remote).sync('journal-1', new Uint8Array(32));

    // This is the red-capable signal: retaining payloads makes activePayloads
    // grow with CHUNK_COUNT or leaves entries after sync. The engine must keep
    // no attachment bytes in SyncResult either.
    expect(generated).toBe(CHUNK_COUNT);
    expect(uploaded).toBe(CHUNK_COUNT);
    expect(peakActivePayloads).toBe(1);
    expect(activePayloads.size).toBe(0);
    expect(JSON.stringify(result).length).toBeLessThan(1_000);
    // Jest mocks retain every call argument, unlike production AES functions.
    // Clear that test-only reference recorder before measuring retained memory.
    (jest.requireMock('../encryption/utils').aesGcmEncrypt as jest.Mock).mockClear();
    forceGc?.();
    const after = process.memoryUsage();
    console.info(
      `[sync-memory] generated=${generated} uploaded=${uploaded} ` +
        `peakActivePayloadRefs=${peakActivePayloads} retainedPayloadRefs=${activePayloads.size} ` +
        `resultBytes=${JSON.stringify(result).length} heapDelta=${after.heapUsed - before.heapUsed} ` +
        `externalDelta=${after.external - before.external}`,
    );
  });

  it('builds and releases one bounded Drive multipart body per chunk', async () => {
    const activeBodies = new Set<string>();
    let peakActiveBodies = 0;
    let largestBodyChars = 0;
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_input: string, init?: RequestInit) => {
      const body = String(init?.body ?? '');
      activeBodies.add(body);
      peakActiveBodies = Math.max(peakActiveBodies, activeBodies.size);
      largestBodyChars = Math.max(largestBodyChars, body.length);
      await Promise.resolve();
      activeBodies.delete(body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'chunk-id', name: 'chunk' }),
      } as Response;
    }) as typeof fetch;

    try {
      for (let index = 0; index < CHUNK_COUNT; index++) {
        const payload = Buffer.alloc(CHUNK_BYTES, index).toString('base64');
        await createFile(
          'token',
          { name: `chunk-${index}`, mimeType: 'application/octet-stream', parents: ['parent'] },
          payload,
        );
      }
    } finally {
      global.fetch = originalFetch;
    }

    expect(peakActiveBodies).toBe(1);
    expect(activeBodies.size).toBe(0);
    // A multipart body may add headers/boundaries, but must never aggregate all
    // 96 chunks (about 64 MiB base64) into one request.
    expect(largestBodyChars).toBeLessThan(CHUNK_BYTES * 2);
    console.info(
      `[drive-memory] requests=${CHUNK_COUNT} peakActiveBodyRefs=${peakActiveBodies} ` +
        `retainedBodyRefs=${activeBodies.size} largestBodyChars=${largestBodyChars}`,
    );
  });
});
