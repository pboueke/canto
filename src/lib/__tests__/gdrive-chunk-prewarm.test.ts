import type { Attachment } from 'canto-data';
import { GDriveRemoteStore } from '../sync/gdrive/store';
import * as api from '../sync/gdrive/api';

jest.mock('../sync/gdrive/api');

const mockedApi = api as jest.Mocked<typeof api>;
const TOKEN = 'test-token';
const JOURNAL_ID = 'journal-1';
const ATTACHMENTS_FOLDER_ID = 'attachments-id';

const attachment: Attachment = {
  id: 'attachment-1',
  path: '/local/attachment-1',
  name: 'video.mp4',
  type: 'file',
  size: 1024,
  encrypted: false,
  deleted: false,
  content: {
    format: 'canto-chunked-v1',
    byteLength: 1024,
    chunkSize: 512,
    chunkCount: 2,
    generation: 'generation-1',
  },
};

function folder(id: string, name: string) {
  return { id, name, mimeType: 'application/vnd.google-apps.folder', modifiedTime: '' };
}

function configureFolders(chunkFiles: { id: string; name: string }[] = []) {
  mockedApi.listFiles.mockImplementation(async (_token, query) => {
    if (query.includes("name = 'Canto'")) return [folder('root-id', 'Canto')];
    if (query.includes("name = 'journal-1'")) return [folder('journal-id', JOURNAL_ID)];
    if (query.includes("name = 'attachments'")) {
      return [folder(ATTACHMENTS_FOLDER_ID, 'attachments')];
    }
    if (query.includes("name contains 'chunk-v1-")) {
      return chunkFiles.map((file) => ({
        ...file,
        mimeType: 'application/octet-stream',
        modifiedTime: '',
      }));
    }
    const exactName = query.match(/name = '([^']+)'/)?.[1];
    return chunkFiles
      .filter((file) => file.name === exactName)
      .map((file) => ({ ...file, mimeType: 'application/octet-stream', modifiedTime: '' }));
  });
  mockedApi.createFile.mockImplementation(async (_token, metadata) => ({
    id: `created-${metadata.name}`,
    name: metadata.name,
    mimeType: metadata.mimeType ?? 'application/octet-stream',
    modifiedTime: '',
  }));
  mockedApi.updateFile.mockImplementation(async (_token, id, metadata) => ({
    id,
    name: metadata.name ?? 'unknown',
    mimeType: metadata.mimeType ?? 'application/octet-stream',
    modifiedTime: '',
  }));
}

function exactChunkLookups(): string[] {
  return mockedApi.listFiles.mock.calls
    .map(([, query]) => query)
    .filter((query) => query.includes("name = 'chunk-v1-"));
}

describe('GDriveRemoteStore chunk upload prewarm', () => {
  let store: GDriveRemoteStore;

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new GDriveRemoteStore();
    await store.connect({ accessToken: TOKEN });
  });

  it('uses one generation listing and direct creates for a cold upload', async () => {
    configureFolders();

    await store.prepareAttachmentChunkUploads(JOURNAL_ID, [attachment]);
    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 0, 'chunk-0');
    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 1, 'chunk-1');

    expect(mockedApi.listFiles).toHaveBeenCalledWith(
      TOKEN,
      expect.stringContaining("name contains 'chunk-v1-'"),
      'drive',
      undefined,
    );
    expect(exactChunkLookups()).toEqual([]);
    expect(mockedApi.createFile).toHaveBeenCalledTimes(2);
    expect(mockedApi.updateFile).not.toHaveBeenCalled();
  });

  it('prepares present and absent indexes once, then never reads local-present chunks', async () => {
    const existingName = 'chunk-v1-attachment-1-generation-1-0';
    configureFolders([{ id: 'remote-chunk-0', name: existingName }]);

    const prepared = await store.prepareChunkUploads(JOURNAL_ID, [attachment]);

    expect(prepared.missingIndexes(attachment)).toEqual([1]);
    await prepared.uploadMissingChunk(attachment, 1, 'chunk-1');

    expect(exactChunkLookups()).toEqual([]);
    expect(mockedApi.updateFile).not.toHaveBeenCalled();
    expect(mockedApi.createFile).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ name: 'chunk-v1-attachment-1-generation-1-1' }),
      'chunk-1',
      'drive',
      undefined,
    );
    await expect(prepared.uploadMissingChunk(attachment, 0, 'chunk-0')).rejects.toThrow(
      'not prepared as missing',
    );
  });

  it('updates found chunks and creates only missing chunks after a partial upload', async () => {
    const existingName = 'chunk-v1-attachment-1-generation-1-0';
    configureFolders([{ id: 'remote-chunk-0', name: existingName }]);

    await store.prepareAttachmentChunkUploads(JOURNAL_ID, [attachment]);
    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 0, 'chunk-0');
    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 1, 'chunk-1');

    expect(exactChunkLookups()).toEqual([]);
    expect(mockedApi.updateFile).toHaveBeenCalledWith(
      TOKEN,
      'remote-chunk-0',
      expect.objectContaining({ name: existingName }),
      'chunk-0',
      undefined,
    );
    expect(mockedApi.createFile).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ name: 'chunk-v1-attachment-1-generation-1-1' }),
      'chunk-1',
      'drive',
      undefined,
    );
  });

  it('verifies a stale cached ID before creating after a 404 update', async () => {
    const existingName = 'chunk-v1-attachment-1-generation-1-0';
    const remoteFiles = [{ id: 'stale-chunk-0', name: existingName }];
    configureFolders(remoteFiles);
    mockedApi.updateFile.mockRejectedValueOnce({ status: 404 });

    await store.prepareAttachmentChunkUploads(JOURNAL_ID, [attachment]);
    remoteFiles.length = 0;
    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 0, 'chunk-0');

    expect(exactChunkLookups()).toEqual([expect.stringContaining(existingName)]);
    expect(mockedApi.createFile).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({ name: existingName }),
      'chunk-0',
    );
  });

  it('lists only valid indexes for one immutable generation and caches present chunks', async () => {
    configureFolders([
      { id: 'chunk-0', name: 'chunk-v1-attachment-1-generation-1-0' },
      { id: 'chunk-1', name: 'chunk-v1-attachment-1-generation-1-1' },
      { id: 'other-generation', name: 'chunk-v1-attachment-1-other-generation-0' },
      { id: 'invalid', name: 'chunk-v1-attachment-1-generation-1-nope' },
      { id: 'bare-prefix', name: 'chunk-v1-attachment-1-generation-1-' },
      { id: 'decimal', name: 'chunk-v1-attachment-1-generation-1-1.0' },
      { id: 'leading-zero', name: 'chunk-v1-attachment-1-generation-1-01' },
      { id: 'out-of-range', name: 'chunk-v1-attachment-1-generation-1-2' },
    ]);

    const indexes = await store.listAttachmentChunkIndexes(
      JOURNAL_ID,
      attachment.id,
      'generation-1',
      attachment.content!.chunkCount,
    );

    expect([...indexes]).toEqual([0, 1]);
    expect(mockedApi.listFiles).toHaveBeenCalledWith(
      TOKEN,
      expect.stringContaining("name contains 'chunk-v1-attachment-1-generation-1-'"),
      'drive',
      undefined,
    );

    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 0, 'chunk-0');
    expect(mockedApi.updateFile).toHaveBeenCalledWith(
      TOKEN,
      'chunk-0',
      expect.objectContaining({ name: 'chunk-v1-attachment-1-generation-1-0' }),
      'chunk-0',
      undefined,
    );
  });

  it('clears the prewarm state when disconnected', async () => {
    configureFolders();
    await store.prepareAttachmentChunkUploads(JOURNAL_ID, [attachment]);
    await store.disconnect();
    await store.connect({ accessToken: TOKEN });

    await store.uploadAttachmentChunk(JOURNAL_ID, attachment.id, 'generation-1', 0, 'chunk-0');

    expect(exactChunkLookups()).toEqual([
      expect.stringContaining('chunk-v1-attachment-1-generation-1-0'),
    ]);
  });
});
