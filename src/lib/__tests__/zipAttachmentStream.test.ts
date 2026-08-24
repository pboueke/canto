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
});
