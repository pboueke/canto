import type JSZip from 'jszip';
import { ATTACHMENT_CHUNK_SIZE } from '@/lib/storage/attachment-content';

/**
 * Password-encrypted v1 ZIP entries wrap one complete base64 payload in one
 * AES-GCM value. That historical wire format cannot be decrypted incrementally:
 * its authentication tag verifies the complete ciphertext. Plan 19.2.2 keeps
 * flat-v1 archive parsing as an explicitly accepted whole-archive compatibility
 * path, so encrypted v1 entries remain importable instead of being silently
 * rejected by size. New local storage is still chunked after decryption.
 */

interface InternalZipStream {
  on(event: 'data', callback: (chunk: Uint8Array) => void): InternalZipStream;
  on(event: 'end', callback: () => void): InternalZipStream;
  on(event: 'error', callback: (error: Error) => void): InternalZipStream;
  resume(): InternalZipStream;
  pause(): InternalZipStream;
}

interface StreamableZipEntry extends JSZip.JSZipObject {
  _data?: { uncompressedSize?: number };
  internalStream?(type: 'uint8array'): InternalZipStream;
}

/** Read ZIP central-directory metadata without inflating the attachment. */
export function zipAttachmentByteLength(entry: JSZip.JSZipObject): number {
  const size = (entry as StreamableZipEntry)._data?.uncompressedSize;
  if (size === undefined || !Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Attachment ZIP entry has no valid uncompressed size: ${entry.name}`);
  }
  return size;
}

/**
 * Validate the v1 entry's directory metadata before the intentional
 * compatibility materialization described above. Kept as a named boundary so
 * a future framed archive format can replace it without changing importers.
 */
export function assertEncryptedAttachmentCanBeRead(entry: JSZip.JSZipObject): void {
  zipAttachmentByteLength(entry);
}

/**
 * Inflate an unencrypted ZIP entry into exact attachment-sized chunks. JSZip's
 * public async() API accumulates the entire entry, but its internal stream
 * emits incremental Uint8Array values on both native and web. Pause after
 * each source value to keep at most one source value plus one 512 KiB output
 * buffer resident while the LocalStore encrypts and persists a chunk.
 */
export async function* zipAttachmentChunks(
  entry: JSZip.JSZipObject,
  expectedByteLength = zipAttachmentByteLength(entry),
): AsyncGenerator<Uint8Array> {
  const stream = (entry as StreamableZipEntry).internalStream?.('uint8array');
  if (!stream) {
    throw new Error(`Incremental ZIP entry reads are unavailable: ${entry.name}`);
  }

  const source: Uint8Array[] = [];
  let ended = false;
  let failure: Error | undefined;
  let wake: (() => void) | undefined;
  const notify = () => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };

  stream
    .on('data', (chunk) => {
      source.push(chunk);
      stream.pause();
      notify();
    })
    .on('end', () => {
      ended = true;
      notify();
    })
    .on('error', (error) => {
      failure = error;
      notify();
    })
    .resume();

  let sourceChunk: Uint8Array | undefined;
  let sourceOffset = 0;
  let read = 0;
  while (read < expectedByteLength) {
    const output = new Uint8Array(Math.min(ATTACHMENT_CHUNK_SIZE, expectedByteLength - read));
    let outputOffset = 0;
    while (outputOffset < output.length) {
      while (!sourceChunk || sourceOffset === sourceChunk.length) {
        sourceChunk = source.shift();
        sourceOffset = 0;
        if (sourceChunk) {
          stream.resume();
          break;
        }
        if (failure) throw failure;
        if (ended) {
          throw new Error(`Attachment ZIP entry ended early: ${entry.name}`);
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      const copied = Math.min(output.length - outputOffset, sourceChunk.length - sourceOffset);
      output.set(sourceChunk.subarray(sourceOffset, sourceOffset + copied), outputOffset);
      sourceOffset += copied;
      outputOffset += copied;
    }
    read += output.length;
    yield output;
  }

  // The directory size is authoritative. A longer stream indicates malformed
  // archive metadata; never silently publish a descriptor for a prefix.
  while (!sourceChunk || sourceOffset === sourceChunk.length) {
    sourceChunk = source.shift();
    sourceOffset = 0;
    if (sourceChunk) break;
    if (failure) throw failure;
    if (ended) return;
    await new Promise<void>((resolve) => {
      wake = resolve;
    });
  }
  throw new Error(`Attachment ZIP entry exceeded its declared size: ${entry.name}`);
}
