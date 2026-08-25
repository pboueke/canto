import { ATTACHMENT_CHUNK_SIZE } from '../storage/attachment-content';
import {
  blobAttachmentChunks,
  nativeAttachmentChunks,
  type NativeAttachmentFile,
} from '../storage/attachment-ingestion';

async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) chunks.push(chunk);
  return chunks;
}

describe('bounded attachment ingestion', () => {
  const largeSize = ATTACHMENT_CHUNK_SIZE * 3 + 17;

  it('reads a web Blob only in 12 MiB slices without a full-file arrayBuffer', async () => {
    const sliceCalls: Array<[number, number]> = [];
    const blob = {
      size: largeSize,
      slice(start: number, end: number) {
        sliceCalls.push([start, end]);
        const bytes = new Uint8Array(end - start);
        bytes.fill(65);
        return {
          arrayBuffer: async () => bytes.buffer,
        };
      },
      // A whole-blob read would be a regression. The ingestion adapter must
      // never touch this API.
      arrayBuffer: () => {
        throw new Error('full Blob.arrayBuffer must not be called');
      },
    } as unknown as Blob;

    const chunks = await collect(blobAttachmentChunks(blob));

    expect(chunks.map((chunk) => chunk.length)).toEqual([
      ATTACHMENT_CHUNK_SIZE,
      ATTACHMENT_CHUNK_SIZE,
      ATTACHMENT_CHUNK_SIZE,
      17,
    ]);
    expect(sliceCalls).toEqual([
      [0, ATTACHMENT_CHUNK_SIZE],
      [ATTACHMENT_CHUNK_SIZE, ATTACHMENT_CHUNK_SIZE * 2],
      [ATTACHMENT_CHUNK_SIZE * 2, ATTACHMENT_CHUNK_SIZE * 3],
      [ATTACHMENT_CHUNK_SIZE * 3, largeSize],
    ]);
  });

  it('uses native FileHandle.readBytes with a 12 MiB maximum, never File.bytes/readableStream', async () => {
    const readLengths: number[] = [];
    const handle = {
      readBytes: (length: number) => {
        readLengths.push(length);
        return new Uint8Array(length);
      },
      close: jest.fn(),
    };
    const file = {
      size: largeSize,
      open: jest.fn(() => handle),
      bytes: () => {
        throw new Error('File.bytes must not be called');
      },
      readableStream: () => {
        throw new Error('File.readableStream must not be called');
      },
    } as unknown as NativeAttachmentFile;

    const chunks = await collect(nativeAttachmentChunks(file));

    expect(chunks.map((chunk) => chunk.length)).toEqual([
      ATTACHMENT_CHUNK_SIZE,
      ATTACHMENT_CHUNK_SIZE,
      ATTACHMENT_CHUNK_SIZE,
      17,
    ]);
    expect(readLengths).toEqual(chunks.map((chunk) => chunk.length));
    expect(Math.max(...readLengths)).toBe(ATTACHMENT_CHUNK_SIZE);
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it('coalesces short native reads into exact descriptor chunk boundaries', async () => {
    const source = new Uint8Array(ATTACHMENT_CHUNK_SIZE + 3);
    source.forEach((_, index) => {
      source[index] = index % 251;
    });
    let offset = 0;
    const handle = {
      readBytes: (length: number) => {
        const actualLength = Math.min(length, 100_000, source.length - offset);
        const result = source.slice(offset, offset + actualLength);
        offset += result.length;
        return result;
      },
      close: jest.fn(),
    };
    const file = {
      size: source.length,
      open: () => handle,
    } as NativeAttachmentFile;

    const chunks = await collect(nativeAttachmentChunks(file));

    expect(chunks.map((chunk) => chunk.length)).toEqual([ATTACHMENT_CHUNK_SIZE, 3]);
    expect(Array.from(chunks[0].slice(-3))).toEqual(Array.from(source.slice(-6, -3)));
    expect(Array.from(chunks[1])).toEqual(Array.from(source.slice(-3)));
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it('closes a native handle when a source ends before its declared size', async () => {
    const handle = {
      readBytes: () => new Uint8Array(),
      close: jest.fn(),
    };
    const file = {
      size: ATTACHMENT_CHUNK_SIZE + 1,
      open: () => handle,
    } as NativeAttachmentFile;

    await expect(collect(nativeAttachmentChunks(file))).rejects.toThrow(
      'Attachment source ended before its declared size',
    );
    expect(handle.close).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 0.5, Number.NaN])('rejects an unavailable native source size: %p', async (size) => {
    const open = jest.fn();

    await expect(collect(nativeAttachmentChunks({ size, open }))).rejects.toThrow(
      'Attachment size is unavailable for streamed import',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('closes a native handle when it returns more bytes than requested', async () => {
    const handle = {
      readBytes: () => new Uint8Array(2),
      close: jest.fn(),
    };
    const file = {
      size: 1,
      open: () => handle,
    } as NativeAttachmentFile;

    await expect(collect(nativeAttachmentChunks(file))).rejects.toThrow(
      'Attachment source returned an invalid chunk length',
    );
    expect(handle.close).toHaveBeenCalledTimes(1);
  });
});
