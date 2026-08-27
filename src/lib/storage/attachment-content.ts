import type { Attachment, ChunkedAttachmentContent } from 'canto-data';
import { base64ToUint8, generateUUID, uint8ToBase64 } from '@/lib/encryption/utils';

/** Maximum decoded payload per chunk. Keep this aligned with canto-chunked-v1. */
export const ATTACHMENT_CHUNK_SIZE = 12 * 1024 * 1024;
/** Legacy values still cross whole-value crypto APIs, so retain their separate 512 KiB cap. */
export const LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES = 512 * 1024;

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(128);
BASE64_LOOKUP.fill(255);
for (let i = 0; i < BASE64.length; i++) BASE64_LOOKUP[BASE64.charCodeAt(i)] = i;

interface ChunkFrame {
  format: 'canto-chunked-v1';
  journalId: string;
  pageId: string;
  attachmentId: string;
  index: number;
  count: number;
  /** Immutable content generation prevents a valid chunk from another rewrite being substituted. */
  generation?: string;
  data: string;
}

/** Return decoded bytes without materialising a decoded copy of the value. */
export function base64ByteLength(data: string): number {
  const normalized = data.replace(/[\r\n\s]/g, '');
  if (normalized.length === 0) return 0;
  let padding = 0;
  if (normalized.endsWith('==')) padding = 2;
  else if (normalized.endsWith('=')) padding = 1;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

/** Descriptor for new content with an immutable copy-on-write generation. */
export function chunkedContentForByteLength(byteLength: number): ChunkedAttachmentContent {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error(`Invalid attachment byte length: ${byteLength}`);
  }
  return {
    format: 'canto-chunked-v1',
    byteLength,
    chunkSize: ATTACHMENT_CHUNK_SIZE,
    chunkCount: Math.ceil(byteLength / ATTACHMENT_CHUNK_SIZE),
    generation: generateUUID(),
  };
}

/** Descriptor for base64 compatibility input. */
export function chunkedContentForBase64(data: string): ChunkedAttachmentContent {
  return chunkedContentForByteLength(base64ByteLength(data));
}

/**
 * Decode base64 incrementally into exact descriptor-sized payload chunks.
 * Splitting the encoded string on four-character boundaries is incorrect when
 * the chunk size is not divisible by three; it produces an extra partial chunk.
 */
export function splitBase64Chunks(data: string, content: ChunkedAttachmentContent): string[] {
  const clean = data.replace(/[\r\n\s]/g, '');
  if (base64ByteLength(clean) !== content.byteLength) {
    throw new Error('Attachment byte length does not match its chunk descriptor');
  }
  const chunks: string[] = [];
  let current = new Uint8Array(Math.min(content.chunkSize, content.byteLength));
  let used = 0;
  const flush = () => {
    chunks.push(uint8ToBase64(current.subarray(0, used)));
    used = 0;
    current = new Uint8Array(Math.min(content.chunkSize, content.byteLength));
  };
  const push = (byte: number) => {
    if (current.length === 0) throw new Error('Unexpected bytes for empty attachment');
    current[used++] = byte;
    if (used === current.length) flush();
  };

  for (let offset = 0; offset < clean.length; offset += 4) {
    const a = BASE64_LOOKUP[clean.charCodeAt(offset)];
    const b = BASE64_LOOKUP[clean.charCodeAt(offset + 1)];
    const cChar = clean.charCodeAt(offset + 2);
    const dChar = clean.charCodeAt(offset + 3);
    const c = cChar === 61 ? 0 : BASE64_LOOKUP[cChar];
    const d = dChar === 61 ? 0 : BASE64_LOOKUP[dChar];
    if ((a | b | c | d) & 0x80 || Number.isNaN(a) || Number.isNaN(b)) {
      throw new Error('Invalid base64 attachment data');
    }
    push((a << 2) | (b >> 4));
    if (cChar !== 61) push(((b & 15) << 4) | (c >> 2));
    if (dChar !== 61) push(((c & 3) << 6) | d);
  }
  if (used > 0) flush();
  if (chunks.length !== content.chunkCount) {
    throw new Error(
      `Attachment chunk count mismatch: expected ${content.chunkCount}, got ${chunks.length}`,
    );
  }
  return chunks;
}

/** Reassemble only for explicit attachment open/export, never for sync or previews. */
export function joinBase64Chunks(chunks: string[]): string {
  const total = chunks.reduce((sum, chunk) => sum + base64ByteLength(chunk), 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    const decoded = base64ToUint8(chunk);
    bytes.set(decoded, offset);
    offset += decoded.length;
  }
  return uint8ToBase64(bytes);
}

export function encodeChunkFrame(
  journalId: string,
  pageId: string,
  attachment: Attachment,
  index: number,
  data: string,
): string {
  const content = attachment.content;
  if (!content || content.format !== 'canto-chunked-v1' || !content.generation) {
    throw new Error(`Generated chunk descriptor required for attachment: ${attachment.name}`);
  }
  const frame: ChunkFrame = {
    format: 'canto-chunked-v1',
    journalId,
    pageId,
    attachmentId: attachment.id,
    index,
    count: content.chunkCount,
    generation: content.generation,
    data,
  };
  return JSON.stringify(frame);
}

export function decodeChunkFrame(
  value: string,
  journalId: string,
  pageId: string,
  attachment: Attachment,
  index: number,
): string {
  let frame: ChunkFrame;
  try {
    frame = JSON.parse(value) as ChunkFrame;
  } catch {
    throw new Error(`Invalid attachment chunk frame: ${attachment.name} #${index}`);
  }
  const expected = attachment.content;
  if (
    !expected ||
    frame.format !== 'canto-chunked-v1' ||
    frame.journalId !== journalId ||
    frame.pageId !== pageId ||
    frame.attachmentId !== attachment.id ||
    frame.index !== index ||
    frame.count !== expected.chunkCount ||
    // Generation-less descriptors are legacy content. They stay readable
    // locally, but SyncEngine explicitly defers them rather than publishing
    // into a mutable remote address. A generated descriptor must never accept
    // a valid frame from an older or concurrent generation.
    (expected.generation
      ? frame.generation !== expected.generation
      : frame.generation !== undefined) ||
    typeof frame.data !== 'string'
  ) {
    throw new Error(`Invalid attachment chunk identity: ${attachment.name} #${index}`);
  }
  return frame.data;
}
