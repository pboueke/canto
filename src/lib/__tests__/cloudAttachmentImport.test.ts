import type { Attachment, Page } from 'canto-data';
import type { LocalStore } from '../storage/types';
import type { RemoteStore } from '../sync/types';
import {
  downloadCloudPageAttachments,
  LEGACY_CLOUD_IMPORT_LIMIT_BYTES,
} from '../sync/cloud-attachment-import';

jest.mock('../encryption/utils', () => ({
  aesGcmDecrypt: jest.fn((ciphertext: string) => Promise.resolve(ciphertext)),
}));

const key = new Uint8Array(32).fill(1);

function chunkedAttachment(id: string): Attachment {
  return {
    id,
    path: `gdrive://j1/attachments/${id}`,
    name: `${id}.jpg`,
    type: 'image',
    encrypted: false,
    deleted: false,
    size: 2,
    content: {
      format: 'canto-chunked-v1',
      byteLength: 2,
      chunkSize: 512 * 1024,
      chunkCount: 2,
      generation: 'gen-1',
    },
  };
}

function makePage(attachments: Attachment[]): Page {
  return {
    id: 'p1',
    text: '',
    date: '2026-01-01T00:00:00.000Z',
    tags: [],
    images: attachments,
    files: [],
    comments: [],
    modified: 1,
    deleted: false,
  };
}

describe('downloadCloudPageAttachments', () => {
  it('downloads descriptor chunks with at most two concurrent requests and never uses legacy reads', async () => {
    const attachments = [chunkedAttachment('a1'), chunkedAttachment('a2'), chunkedAttachment('a3')];
    const page = makePage(attachments);
    let active = 0;
    let maximumActive = 0;
    const downloadAttachmentChunk = jest.fn(async (_journal, _id, _generation, index) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return `chunk-${index}`;
    });
    const localStore = {
      saveAttachmentChunks: jest.fn(async (_journalId, _pageId, attachment, chunks) => {
        const received: string[] = [];
        for await (const chunk of chunks) received.push(chunk);
        expect(received).toEqual(['chunk-0', 'chunk-1']);
        return `local/${attachment.id}`;
      }),
      saveAttachment: jest.fn(),
    } as unknown as LocalStore;
    const remoteStore = {
      downloadAttachmentChunk,
      downloadAttachment: jest.fn(),
      buildRemotePath: jest.fn(),
    } as unknown as RemoteStore;

    const warnings = await downloadCloudPageAttachments({
      journalId: 'j1',
      page,
      syncKey: key,
      localStore,
      remoteStore,
    });

    expect(warnings).toEqual([]);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(downloadAttachmentChunk).toHaveBeenCalledTimes(6);
    expect(remoteStore.downloadAttachment).not.toHaveBeenCalled();
    expect(attachments.map((attachment) => attachment.path)).toEqual([
      'local/a1',
      'local/a2',
      'local/a3',
    ]);
  });

  it('defers unknown and oversized legacy attachments before any whole-value download', async () => {
    const attachment: Attachment = {
      id: 'legacy',
      path: 'gdrive://j1/attachments/legacy.jpg',
      name: 'legacy.jpg',
      type: 'image',
      encrypted: false,
      deleted: false,
      size: LEGACY_CLOUD_IMPORT_LIMIT_BYTES + 1,
    };
    const remoteStore = {
      downloadAttachment: jest.fn(),
      buildRemotePath: jest.fn(),
    } as unknown as RemoteStore;
    const localStore = { saveAttachment: jest.fn() } as unknown as LocalStore;

    const warnings = await downloadCloudPageAttachments({
      journalId: 'j1',
      page: makePage([attachment]),
      syncKey: key,
      localStore,
      remoteStore,
    });

    expect(warnings).toEqual([
      expect.objectContaining({
        name: 'legacy.jpg',
        size: LEGACY_CLOUD_IMPORT_LIMIT_BYTES + 1,
        reason: 'legacy-attachment-too-large',
      }),
    ]);
    expect(remoteStore.downloadAttachment).not.toHaveBeenCalled();
  });

  it('defers generation-less chunk descriptors rather than reading a mutable remote address', async () => {
    const attachment = chunkedAttachment('old-chunk');
    delete attachment.content!.generation;
    const remoteStore = {
      downloadAttachmentChunk: jest.fn(),
      downloadAttachment: jest.fn(),
      buildRemotePath: jest.fn(),
    } as unknown as RemoteStore;
    const localStore = { saveAttachmentChunks: jest.fn() } as unknown as LocalStore;

    const warnings = await downloadCloudPageAttachments({
      journalId: 'j1',
      page: makePage([attachment]),
      syncKey: key,
      localStore,
      remoteStore,
    });

    expect(warnings).toEqual([
      expect.objectContaining({ name: 'old-chunk.jpg', reason: 'chunk-generation-missing' }),
    ]);
    expect(remoteStore.downloadAttachmentChunk).not.toHaveBeenCalled();
  });
});
