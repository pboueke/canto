import JSZip from 'jszip';
import {
  assertEncryptedAttachmentCanBeRead,
  zipAttachmentByteLength,
  zipAttachmentChunks,
} from '../backup/zip-attachment-stream';
import { ATTACHMENT_CHUNK_SIZE } from '../storage/attachment-content';

async function loadedEntry(data: Uint8Array): Promise<JSZip.JSZipObject> {
  const zip = new JSZip();
  zip.file('attachments/file-a.bin', data, { compression: 'DEFLATE' });
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  return loaded.file('attachments/file-a.bin')!;
}

describe('zipAttachmentChunks', () => {
  it('streams an oversized v1 attachment without async(base64) and emits exact descriptor chunks', async () => {
    const bytes = new Uint8Array(ATTACHMENT_CHUNK_SIZE * 2 + 17);
    bytes.forEach((_, index) => {
      bytes[index] = index % 251;
    });
    const entry = await loadedEntry(bytes);
    const asyncSpy = jest.spyOn(entry, 'async');
    const chunks: Uint8Array[] = [];

    for await (const chunk of zipAttachmentChunks(entry)) chunks.push(chunk);

    expect(asyncSpy.mock.calls.some(([type]) => type === 'base64')).toBe(false);
    expect(zipAttachmentByteLength(entry)).toBe(bytes.length);
    expect(chunks.map((chunk) => chunk.length)).toEqual([
      ATTACHMENT_CHUNK_SIZE,
      ATTACHMENT_CHUNK_SIZE,
      17,
    ]);
    expect(chunks.flatMap((chunk) => [...chunk])).toEqual([...bytes]);
  });

  it('keeps a large encrypted v1 entry compatible while validating ZIP metadata', async () => {
    const entry = await loadedEntry(new Uint8Array(ATTACHMENT_CHUNK_SIZE + 29));
    const asyncSpy = jest.spyOn(entry, 'async');

    // v1 AES-GCM authenticates one complete ciphertext. Flat-v1 import is the
    // plan-approved compatibility exception, so size alone must not reject it.
    expect(() => assertEncryptedAttachmentCanBeRead(entry)).not.toThrow();
    expect(asyncSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid central-directory sizes and unavailable incremental readers', () => {
    expect(() => zipAttachmentByteLength({ name: 'unknown' } as JSZip.JSZipObject)).toThrow(
      'no valid uncompressed size',
    );
    expect(() =>
      zipAttachmentByteLength({
        name: 'fractional',
        _data: { uncompressedSize: 1.5 },
      } as unknown as JSZip.JSZipObject),
    ).toThrow('no valid uncompressed size');
    expect(() =>
      zipAttachmentChunks({
        name: 'flat',
        _data: { uncompressedSize: 1 },
      } as unknown as JSZip.JSZipObject).next(),
    ).rejects.toThrow('Incremental ZIP entry reads are unavailable');
  });

  it.each([
    ['ended early', undefined, undefined, 1, 'ended early'],
    ['exceeded size', new Uint8Array([1, 2]), undefined, 1, 'exceeded its declared size'],
    ['stream error', undefined, new Error('inflate failed'), 1, 'inflate failed'],
  ])('surfaces %s from the incremental stream', async (_label, data, error, size, message) => {
    let handlers: Record<string, ((value?: unknown) => void) | undefined> = {};
    const stream = {} as {
      on: jest.Mock;
      pause: jest.Mock;
      resume: jest.Mock;
    };
    stream.on = jest.fn((event: string, callback: (value?: unknown) => void) => {
      handlers[event] = callback;
      return stream;
    });
    stream.pause = jest.fn(() => stream);
    stream.resume = jest.fn(() => {
      if (data) handlers.data?.(data);
      if (error) handlers.error?.(error);
      else handlers.end?.();
      return stream;
    });
    const entry = {
      name: 'broken.bin',
      _data: { uncompressedSize: size },
      internalStream: () => stream,
    } as unknown as JSZip.JSZipObject;

    const chunks = zipAttachmentChunks(entry);
    if (message === 'exceeded its declared size') {
      await expect(chunks.next()).resolves.toMatchObject({ value: new Uint8Array([1]) });
    }
    await expect(chunks.next()).rejects.toThrow(message);
  });
});
