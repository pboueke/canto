import type { Attachment, Page } from 'canto-data';
import { downloadCloudPageAttachments } from '../cloud-attachment-import';
import type { LocalStore } from '@/lib/storage/types';
import type { RemoteStore } from '../types';

jest.mock('@/lib/encryption/utils', () => ({
  aesGcmDecrypt: jest.fn((value: string) => Promise.resolve(value)),
}));

function attachment(id: string, extra: Partial<Attachment> = {}): Attachment {
  return {
    id,
    path: `gdrive://journal-1/attachments/${id}.bin`,
    name: `${id}.bin`,
    type: 'file',
    encrypted: false,
    deleted: false,
    ...extra,
  };
}

function page(files: Attachment[]): Page {
  return {
    id: 'page-1',
    text: '',
    date: '2026-01-01',
    tags: [],
    images: [],
    files,
    comments: [],
    modified: 1,
    deleted: false,
  };
}

function localStore(): LocalStore {
  return {
    saveAttachment: jest.fn().mockResolvedValue('/local/legacy'),
    saveAttachmentChunks: jest.fn(async (_journal, _page, _attachment, chunks) => {
      for await (const _chunk of chunks) {
        // Deliberately consume the generator: this verifies bounded remote reads.
      }
      return '/local/chunked';
    }),
  } as unknown as LocalStore;
}

function remoteStore(): RemoteStore {
  return {
    buildRemotePath: jest.fn((_journal, name) => `remote/${name}`),
    downloadAttachment: jest.fn((path) =>
      Promise.resolve(path === 'remote/missing.bin' ? null : 'legacy'),
    ),
    downloadAttachmentChunk: jest.fn((_journal, _id, _generation, index) =>
      Promise.resolve(index === 0 ? 'chunk-0' : 'chunk-1'),
    ),
  } as unknown as RemoteStore;
}

describe('downloadCloudPageAttachments', () => {
  it('imports bounded chunked and safe legacy attachments while returning actionable warnings', async () => {
    const chunked = attachment('chunked', {
      content: {
        format: 'canto-chunked-v1',
        byteLength: 2,
        chunkSize: 1,
        chunkCount: 2,
        generation: 'generation-1',
      },
    });
    const missingGeneration = attachment('missing-generation', {
      content: {
        format: 'canto-chunked-v1',
        byteLength: 1,
        chunkSize: 1,
        chunkCount: 1,
        generation: '',
      },
    });
    const large = attachment('large', { size: 512 * 1024 + 1 });
    const missing = attachment('missing', { size: 1 });
    const legacy = attachment('legacy', { size: 1 });
    const local = localStore();
    const remote = remoteStore();

    const warnings = await downloadCloudPageAttachments({
      journalId: 'journal-1',
      page: page([chunked, missingGeneration, large, missing, legacy]),
      syncKey: new Uint8Array(32),
      localStore: local,
      remoteStore: remote,
    });

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: missingGeneration.name,
          reason: 'chunk-generation-missing',
        }),
        expect.objectContaining({ name: large.name, reason: 'legacy-attachment-too-large' }),
        expect.objectContaining({ name: missing.name, reason: 'attachment-not-found' }),
      ]),
    );
    expect(chunked.path).toBe('/local/chunked');
    expect(legacy.path).toBe('/local/legacy');
    expect(local.saveAttachmentChunks).toHaveBeenCalledWith(
      'journal-1',
      'page-1',
      chunked,
      expect.anything(),
    );
  });

  it('fails clearly when the bounded chunk transfer capability is absent', async () => {
    const local = localStore();
    delete local.saveAttachmentChunks;
    const remote = remoteStore();
    await expect(
      downloadCloudPageAttachments({
        journalId: 'journal-1',
        page: page([
          attachment('chunked', {
            content: {
              format: 'canto-chunked-v1',
              byteLength: 1,
              chunkSize: 1,
              chunkCount: 1,
              generation: 'generation-1',
            },
          }),
        ]),
        syncKey: new Uint8Array(32),
        localStore: local,
        remoteStore: remote,
      }),
    ).rejects.toThrow('Chunked attachment transfer is unavailable');
  });
});
