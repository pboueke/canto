import { NativeModules, Platform } from 'react-native';

export interface NativeArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  method: number;
  crc: number;
  directory: boolean;
}

export interface NativeArchive {
  id: string;
  entries: NativeArchiveEntry[];
  sourceFingerprint?: string;
}

interface NativeArchiveModule {
  open(
    sourceUri: string,
    operationId: string,
    expectedFingerprint?: string,
  ): Promise<NativeArchive>;
  readText(archiveId: string, entryName: string, maxBytes: number): Promise<string>;
  extract(
    archiveId: string,
    entryName: string,
    destinationUri: string,
    operationId: string,
  ): Promise<{ uri: string; size: number }>;
  cancel?(operationId: string): Promise<void>;
  close(archiveId: string): Promise<void>;
  availableBytes(): Promise<number>;
}

const nativeArchive = NativeModules?.CantoArchive as NativeArchiveModule | undefined;

const ZIP_STORED = 0;
const ZIP_DEFLATED = 8;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
// Text-heavy journal pages compress unusually well; retain compatibility while
// still rejecting the multi-order-of-magnitude expansion used by ZIP bombs.
const MAX_COMPRESSION_RATIO = 10_000;

export function supportsNativeArchive(): boolean {
  return Platform.OS === 'android' && !!nativeArchive;
}

export async function openNativeArchive(
  sourceUri: string,
  signal?: AbortSignal,
  expectedFingerprint?: string,
): Promise<NativeArchive> {
  if (!supportsNativeArchive()) throw new Error('Native archive reader is unavailable');
  if (signal?.aborted) throw new Error('Archive opening cancelled');
  const operationId = `open:${Date.now()}:${Math.random()}`;
  const cancel = () => {
    const request = nativeArchive!.cancel?.(operationId);
    if (request) void request.catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  let archive: NativeArchive;
  try {
    archive = await nativeArchive!.open(sourceUri, operationId, expectedFingerprint);
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
  try {
    validateArchiveInventory(archive.entries);
    return archive;
  } catch (error) {
    // The inventory is untrusted until validation completes. Do not leave the
    // native copy behind when validation rejects a malicious archive.
    await nativeArchive!.close(archive.id).catch(() => undefined);
    throw error;
  }
}

export async function readNativeArchiveText(
  archive: NativeArchive,
  entryName: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<string> {
  const entry = findEntry(archive, entryName);
  if (entry.size > maxBytes) throw new Error(`Archive metadata entry exceeds limit: ${entryName}`);
  return nativeArchive!.readText(archive.id, entryName, maxBytes);
}

export async function extractNativeArchiveEntry(
  archive: NativeArchive,
  entryName: string,
  destinationUri: string,
  signal?: AbortSignal,
): Promise<{ uri: string; size: number }> {
  const entry = findEntry(archive, entryName);
  if (signal?.aborted) throw new Error('Archive extraction cancelled');
  const operationId = `${archive.id}:${entryName}:${Date.now()}:${Math.random()}`;
  const cancel = () => {
    const request = nativeArchive!.cancel?.(operationId);
    if (request) void request.catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  let extracted: { uri: string; size: number };
  try {
    extracted = await nativeArchive!.extract(archive.id, entryName, destinationUri, operationId);
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
  if (extracted.size !== entry.size)
    throw new Error(`Archive extraction length mismatch: ${entryName}`);
  return extracted;
}

export async function closeNativeArchive(archive: NativeArchive): Promise<void> {
  await nativeArchive?.close(archive.id);
}

export async function nativeArchiveAvailableBytes(): Promise<number> {
  if (!supportsNativeArchive()) throw new Error('Native archive reader is unavailable');
  const bytes = await nativeArchive!.availableBytes();
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Native archive free space is unavailable');
  return bytes;
}

export function findEntry(archive: NativeArchive, name: string): NativeArchiveEntry {
  const entry = archive.entries.find((candidate) => candidate.name === name);
  if (!entry || entry.directory) throw new Error(`Invalid backup: missing ${name}`);
  return entry;
}

/** Validate central-directory data before a page or attachment is read. */
export function validateArchiveInventory(entries: NativeArchiveEntry[]): void {
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('Archive contains too many entries');
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of entries) {
    const segments = entry.name.replace(/\/$/, '').split('/');
    if (
      !entry.name ||
      entry.name.startsWith('/') ||
      entry.name.includes('\\') ||
      entry.name.includes('\0') ||
      segments.some((part) => part === '.' || part === '..' || part === '') ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !Number.isSafeInteger(entry.compressedSize) ||
      entry.compressedSize < 0 ||
      !Number.isSafeInteger(entry.method) ||
      (entry.method !== ZIP_STORED && entry.method !== ZIP_DEFLATED) ||
      !Number.isSafeInteger(entry.crc) ||
      entry.crc < 0 ||
      entry.crc > 0xffffffff ||
      names.has(entry.name)
    ) {
      throw new Error(`Invalid archive entry: ${entry.name}`);
    }
    if (
      !entry.directory &&
      entry.compressedSize > 0 &&
      entry.size / entry.compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new Error(`Archive entry compression ratio exceeds limit: ${entry.name}`);
    }
    totalBytes += entry.size;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error('Archive uncompressed size exceeds limit');
    }
    names.add(entry.name);
  }
  if (entries.filter((entry) => !entry.directory && entry.name === 'manifest.json').length !== 1) {
    throw new Error('Invalid backup: missing manifest.json');
  }
  if (entries.filter((entry) => !entry.directory && entry.name === 'journal.json').length !== 1) {
    throw new Error('Invalid backup: missing journal.json');
  }
}
