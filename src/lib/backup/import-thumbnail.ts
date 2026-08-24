import type JSZip from 'jszip';
import { base64ByteLength, ATTACHMENT_CHUNK_SIZE } from '@/lib/storage/attachment-content';
import { base64ToUint8 } from '@/lib/encryption/utils';
import { zipAttachmentChunks } from './zip-attachment-stream';
import { generateThumbnailFromChunks } from '@/lib/thumbnail';

/** Avoid decoding a full-resolution source just for a decorative preview. */
export const IMPORT_THUMBNAIL_SOURCE_LIMIT_BYTES = 8 * 1024 * 1024;
export const IMPORT_THUMBNAIL_MAX_BYTES = 128 * 1024;
/** 16 MP is at most 64 MiB of RGBA decoder output before downscaling. */
export const IMPORT_THUMBNAIL_MAX_PIXELS = 16 * 1024 * 1024;
const HEADER_BYTES = 512 * 1024;

export interface ImageDimensions {
  width: number;
  height: number;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function isSof(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 <= bytes.length) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    // Standalone markers do not have a segment length.
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 2 > bytes.length) return null;
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (isSof(marker)) {
      if (length < 8) return null;
      return { width: u16be(bytes, offset + 5), height: u16be(bytes, offset + 3) };
    }
    offset += length;
  }
  return null;
}

/**
 * Read image dimensions without invoking an image decoder. Unsupported formats
 * intentionally return null: import remains successful without a preview.
 */
export function imageDimensionsFromHeader(bytes: Uint8Array): ImageDimensions | null {
  // PNG IHDR
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52
  ) {
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }

  // GIF logical screen descriptor
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  }

  // WebP VP8X / VP8 / VP8L
  if (
    bytes.length >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const tag = String.fromCharCode(...bytes.subarray(12, 16));
    if (tag === 'VP8X' && bytes.length >= 30) {
      return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    }
    if (
      tag === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d &&
      bytes[24] === 0x01 &&
      bytes[25] === 0x2a
    ) {
      return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    }
    if (tag === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return jpegDimensions(bytes);
}

export function isSafeThumbnailDimensions(dimensions: ImageDimensions | null): boolean {
  return Boolean(
    dimensions &&
    Number.isSafeInteger(dimensions.width) &&
    Number.isSafeInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0 &&
    dimensions.width * dimensions.height <= IMPORT_THUMBNAIL_MAX_PIXELS,
  );
}

async function* base64Chunks(base64: string): AsyncGenerator<Uint8Array> {
  // Decode in independently padded quanta; do not make a Uint8Array for the
  // entire decrypted flat-v1 attachment just to create its preview.
  const charsPerChunk = Math.floor((ATTACHMENT_CHUNK_SIZE * 4) / 3 / 4) * 4;
  for (let offset = 0; offset < base64.length; offset += charsPerChunk) {
    yield base64ToUint8(base64.slice(offset, offset + charsPerChunk));
  }
}

async function takeFirstChunk(
  chunks: AsyncGenerator<Uint8Array>,
): Promise<{ first: Uint8Array; replay: AsyncIterable<Uint8Array> } | null> {
  const first = await chunks.next();
  if (first.done || !first.value) return null;
  return {
    first: first.value,
    replay: {
      async *[Symbol.asyncIterator]() {
        yield first.value;
        yield* chunks;
      },
    },
  };
}

/**
 * Build one small persisted preview from an image ZIP entry or an already
 * decrypted v1 attachment. Original images are passed to platform decoders as
 * URI/Blob data, never as a base64 data URL.
 */
export async function generateImportThumbnail(
  entry: JSZip.JSZipObject,
  byteLength: number,
  decryptedBase64?: string,
): Promise<string | null> {
  if (byteLength <= 0 || byteLength > IMPORT_THUMBNAIL_SOURCE_LIMIT_BYTES) return null;

  try {
    const source =
      decryptedBase64 === undefined
        ? zipAttachmentChunks(entry, byteLength)
        : base64Chunks(decryptedBase64);
    const prepared = await takeFirstChunk(source);
    if (!prepared || !isSafeThumbnailDimensions(imageDimensionsFromHeader(prepared.first))) {
      return null;
    }

    const thumbnail = await generateThumbnailFromChunks(prepared.replay, entry.name);
    return base64ByteLength(thumbnail) <= IMPORT_THUMBNAIL_MAX_BYTES ? thumbnail : null;
  } catch {
    return null;
  }
}

/** Used by tests and documentation to keep the ZIP work chunk-bounded. */
export const IMPORT_THUMBNAIL_STREAM_CHUNK_BYTES = ATTACHMENT_CHUNK_SIZE;
/** Header parsing is limited to the first bounded attachment chunk. */
export const IMPORT_THUMBNAIL_HEADER_LIMIT_BYTES = HEADER_BYTES;
