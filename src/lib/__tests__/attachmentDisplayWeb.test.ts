import type { Attachment } from 'canto-data';
import type { LocalStore } from '../storage';
import {
  materializeAttachmentDisplay,
  purgeAttachmentDisplayCache,
  purgeEncryptedAttachmentDisplayCache,
  scavengeAttachmentDisplayCache,
} from '../attachment-display.web';

const createObjectURL = jest.fn(() => 'blob:canto-display');
const revokeObjectURL = jest.fn();

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

describe('browser attachment display materializer', () => {
  beforeAll(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  beforeEach(() => {
    purgeAttachmentDisplayCache();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  it('leases a Blob URL once and revokes an encrypted image on final release', async () => {
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const first = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
    const second = await materializeAttachmentDisplay(store, attachment, new Uint8Array(32));

    expect(first.uri).toBe('blob:canto-display');
    expect(second.uri).toBe(first.uri);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    first.release();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    second.release();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:canto-display');
  });

  it('does not publish encrypted Blob output that finishes after backgrounding', async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await waiting;
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;

    const display = materializeAttachmentDisplay(store, attachment, new Uint8Array(32));
    await Promise.resolve();
    purgeEncryptedAttachmentDisplayCache();
    finish();

    await expect(display).rejects.toThrow('materialization cancelled');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:canto-display');
  });

  it('rejects cancelled, mismatched, and unsupported display work without retaining a URL', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const cancelledStore = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
      }),
    } as unknown as LocalStore;
    await expect(
      materializeAttachmentDisplay(cancelledStore, attachment, new Uint8Array(32), aborted.signal),
    ).rejects.toThrow('materialization cancelled');

    const wrongLengthStore = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
      }),
    } as unknown as LocalStore;
    await expect(materializeAttachmentDisplay(wrongLengthStore, attachment)).rejects.toThrow(
      'length mismatch',
    );
    await expect(materializeAttachmentDisplay({} as LocalStore, attachment)).rejects.toThrow(
      'Streaming attachment display is unavailable',
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('purges unencrypted cache entries and treats startup scavenging as a no-op', async () => {
    const plain = { ...attachment, encrypted: false, content: undefined };
    const store = {
      forEachAttachmentDisplayChunk: jest.fn(async (_attachment, visitor) => {
        await visitor(0, 'AQI=');
        await visitor(1, 'Aw==');
      }),
    } as unknown as LocalStore;
    const display = await materializeAttachmentDisplay(store, plain);

    purgeAttachmentDisplayCache();
    display.release();
    scavengeAttachmentDisplayCache();

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('shares in-flight plain Blob work and accepts a repeated lease release', async () => {
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

    first.release();
    first.release();
    second.release();
    expect(store.forEachAttachmentDisplayChunk).toHaveBeenCalledTimes(1);
  });
});
