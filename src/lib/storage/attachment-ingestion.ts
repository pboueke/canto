import { ATTACHMENT_CHUNK_SIZE } from './attachment-content';

/** Minimal Expo FileHandle surface used for bounded native attachment ingestion. */
export interface NativeAttachmentFile {
  size: number;
  open(): {
    readBytes(length: number): Uint8Array;
    close(): void;
  };
}

/**
 * Read a browser File/Blob in exact bounded slices. Do not replace this with
 * Blob.arrayBuffer(): that creates a full-file allocation before storage has a
 * chance to frame and encrypt each chunk.
 */
export async function* blobAttachmentChunks(blob: Blob): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < blob.size; offset += ATTACHMENT_CHUNK_SIZE) {
    const end = Math.min(offset + ATTACHMENT_CHUNK_SIZE, blob.size);
    yield new Uint8Array(await blob.slice(offset, end).arrayBuffer());
  }
}

/**
 * Read an Expo FileHandle in exact bounded requests. File.readableStream() may
 * choose an implementation-defined source read size; readBytes keeps every
 * native source allocation at or below ATTACHMENT_CHUNK_SIZE.
 */
export async function* nativeAttachmentChunks(
  file: NativeAttachmentFile,
): AsyncGenerator<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error('Attachment size is unavailable for streamed import');
  }

  const handle = file.open();
  let remaining = file.size;
  try {
    while (remaining > 0) {
      // Expo FileHandle.readBytes is permitted to return fewer bytes than
      // requested. Coalesce those reads so every emitted value is exactly a
      // descriptor chunk (except the final chunk), keeping storage framing
      // deterministic without ever requesting or allocating more than one.
      const expectedLength = Math.min(ATTACHMENT_CHUNK_SIZE, remaining);
      const assembled = new Uint8Array(expectedLength);
      let offset = 0;
      while (offset < expectedLength) {
        const chunk = handle.readBytes(expectedLength - offset);
        if (chunk.length === 0) {
          throw new Error('Attachment source ended before its declared size');
        }
        if (chunk.length > expectedLength - offset || chunk.length > remaining) {
          throw new Error('Attachment source returned an invalid chunk length');
        }
        assembled.set(chunk, offset);
        offset += chunk.length;
        remaining -= chunk.length;
      }
      yield assembled;
    }
  } finally {
    handle.close();
  }
}
