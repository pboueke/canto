import type { NativeArchiveEntry } from './native-archive';

const AES_GCM_OVERHEAD_BYTES = 12 + 16;
const CHUNK_FRAME_METADATA_BYTES = 1_024;
const ATTACHMENT_MANIFEST_METADATA_BYTES = 2_048;
const IMPORT_SAFETY_RESERVE_BYTES = 32 * 1024 * 1024;

function base64Length(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

function aesGcmStorageLength(plaintextBytes: number): number {
  return base64Length(plaintextBytes + AES_GCM_OVERHEAD_BYTES);
}

/** The import writes password-encrypted copies conservatively before device encryption. */
function encryptedStorageLength(plaintextBytes: number): number {
  return aesGcmStorageLength(aesGcmStorageLength(plaintextBytes));
}

function maximumDecodedBase64Bytes(encodedBytes: number): number {
  return Math.ceil(encodedBytes / 4) * 3;
}

export interface NativeImportDiskEstimate {
  requiredBytes: number;
  localStorageBytes: number;
  largestTemporaryEntryBytes: number;
}

/**
 * Estimate future on-disk use from the concrete local chunk format. Attachment
 * ZIP entries are base64 text; each copied owner receives framed base64 chunks,
 * then the device/password AES-GCM layers stored as base64 text.
 */
export function estimateNativeImportDiskUse(
  entries: readonly NativeArchiveEntry[],
  attachmentCopies: ReadonlyMap<string, number>,
  chunkSize: number,
): NativeImportDiskEstimate {
  let localStorageBytes = 0;
  let largestTemporaryEntryBytes = 0;

  for (const entry of entries) {
    if (entry.directory) continue;
    if (entry.name.startsWith('attachments/')) {
      largestTemporaryEntryBytes = Math.max(largestTemporaryEntryBytes, entry.size);
      const copies = attachmentCopies.get(entry.name) ?? 0;
      const decodedBytes = maximumDecodedBase64Bytes(entry.size);
      const chunkCount = Math.ceil(decodedBytes / chunkSize);
      let perCopy = encryptedStorageLength(ATTACHMENT_MANIFEST_METADATA_BYTES);
      for (let index = 0; index < chunkCount; index += 1) {
        const chunkBytes = Math.min(chunkSize, decodedBytes - index * chunkSize);
        perCopy += encryptedStorageLength(base64Length(chunkBytes) + CHUNK_FRAME_METADATA_BYTES);
      }
      localStorageBytes += perCopy * copies;
    } else {
      // Metadata, pages, settings, and the generated catalog are encrypted
      // text files. The catalog is bounded by the aggregate page preview data,
      // so reserving another encrypted page payload is conservative.
      localStorageBytes += encryptedStorageLength(entry.size);
      if (entry.name.startsWith('pages/')) localStorageBytes += encryptedStorageLength(entry.size);
    }
  }

  const requiredBytes =
    localStorageBytes + largestTemporaryEntryBytes + IMPORT_SAFETY_RESERVE_BYTES;
  return { requiredBytes, localStorageBytes, largestTemporaryEntryBytes };
}
