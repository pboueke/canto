import type { Attachment } from 'canto-data';

const mockWriteBytes = jest.fn();
const mockClose = jest.fn();
const mockDeleteFile = jest.fn();
const mockDirectoryList = jest.fn(() => []);
let mockDirectoryExists = true;

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: '/cache' } },
  Directory: jest.fn().mockImplementation(() => ({
    uri: '/cache/canto-display',
    get exists() {
      return mockDirectoryExists;
    },
    create: jest.fn(),
    list: mockDirectoryList,
  })),
  File: jest.fn().mockImplementation(() => ({
    uri: '/cache/canto-display/opaque',
    exists: true,
    create: jest.fn(),
    open: () => ({ writeBytes: mockWriteBytes, close: mockClose }),
    delete: mockDeleteFile,
  })),
}));

import {
  materializeAttachmentDisplay,
  purgeAttachmentDisplayCache,
  purgeEncryptedAttachmentDisplayCache,
  scavengeAttachmentDisplayCache,
} from '../attachment-display';
import type { LocalStore } from '../storage';

const attachment: Attachment = {
  id: 'image-1',
  path: 'canto/journal/attachments/chunk-v1-page-image-generation',
  name: 'photo.jpg',
  type: 'image',
  encrypted: true,
  deleted: false,
  content: {
    format: 'canto-chunked-v1',
    byteLength: 3,
    chunkSize: 2,
    chunkCount: 2,
    generation: 'generation',
  },
};

describe('attachment display materializer', () => {
  beforeEach(() => {
    purgeAttachmentDisplayCache();
    mockWriteBytes.mockClear();
    mockClose.mockClear();
    mockDeleteFile.mockClear();
    mockDirectoryList.mockClear();
    mockDirectoryExists = true;
  });

  it('writes one decoded chunk at a time and deletes encrypted output on release', async () => {
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const lease = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));

    expect(store.forEachAttachmentDisplayChunk).toHaveBeenCalledWith(
      attachment,
      expect.any(Function),
      expect.any(Uint8Array),
    );
    expect(mockWriteBytes).toHaveBeenNthCalledWith(1, new Uint8Array([1, 2]));
    expect(mockWriteBytes).toHaveBeenNthCalledWith(2, new Uint8Array([3]));
    expect(mockClose).toHaveBeenCalledTimes(1);

    lease.release();
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('shares one completed display lease for the same immutable generation', async () => {
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const first = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
    const second = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));

    expect(first.uri).toBe(second.uri);
    expect(store.forEachAttachmentDisplayChunk).toHaveBeenCalledTimes(1);
    first.release();
    expect(mockDeleteFile).not.toHaveBeenCalled();
    second.release();
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('purges an actively leased encrypted display exactly once on app background', async () => {
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const lease = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
    purgeEncryptedAttachmentDisplayCache();
    lease.release();

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('does not publish encrypted work that finishes after app background', async () => {
    let finishMaterialization!: () => void;
    const materializationFinished = new Promise<void>((resolve) => {
      finishMaterialization = resolve;
    });
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await materializationFinished;
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const display = materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
    await Promise.resolve();
    purgeEncryptedAttachmentDisplayCache();
    finishMaterialization();

    await expect(display).rejects.toThrow('materialization cancelled');
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);

    const retryStore = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;
    const retry = await materializeAttachmentDisplay(retryStore, attachment, new Uint8Array(32));
    retry.release();
    expect(mockDeleteFile).toHaveBeenCalledTimes(2);
  });

  it('rejects missing, cancelled, and malformed native streams while removing partial output', async () => {
    await expect(materializeAttachmentDisplay({} as LocalStore, attachment)).rejects.toThrow(
      'Streaming attachment display is unavailable',
    );

    const controller = new AbortController();
    controller.abort();
    const cancelled = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
      }),
    } as unknown as LocalStore;
    await expect(
      materializeAttachmentDisplay(cancelled, attachment, new Uint8Array(32), controller.signal),
    ).rejects.toThrow('materialization cancelled');

    const wrongLength = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
      }),
    } as unknown as LocalStore;
    await expect(materializeAttachmentDisplay(wrongLength, attachment)).rejects.toThrow(
      'length mismatch',
    );

    expect(mockClose).toHaveBeenCalled();
    expect(mockDeleteFile).toHaveBeenCalled();
  });

  it('uses the URI-based browser path and scavenges only native startup cache files', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    const originalPlatform = Platform.OS;
    const createObjectURL = jest.fn(() => 'blob:display');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    Platform.OS = 'web';
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;
    try {
      const lease = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
      lease.release();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:display');
    } finally {
      Platform.OS = originalPlatform;
    }

    scavengeAttachmentDisplayCache();
    expect(mockDirectoryList).toHaveBeenCalledTimes(1);

    mockDirectoryExists = false;
    scavengeAttachmentDisplayCache();
    expect(mockDirectoryList).toHaveBeenCalledTimes(1);
  });

  it('shares in-flight work and handles plain cache leases without encryption lifecycle state', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const plain = { ...attachment, encrypted: false, content: undefined };
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await waiting;
        await visitor(0, 'AQI=');
      }),
    } as unknown as LocalStore;

    const firstPromise = materializeAttachmentDisplay(store, plain);
    const secondPromise = materializeAttachmentDisplay(store, plain);
    finish();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(store.forEachAttachmentDisplayChunk).toHaveBeenCalledTimes(1);
    first.release();
    first.release();
    second.release();
    purgeEncryptedAttachmentDisplayCache();
    purgeAttachmentDisplayCache();
  });
});
