import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import type { Attachment } from 'canto-data';
import type { LocalStore } from '@/lib/storage';
import { base64ToUint8, generateUUID } from '@/lib/encryption/utils';

export interface AttachmentDisplayLease {
  uri: string;
  release(): void;
}

interface CachedDisplay {
  uri: string;
  bytes: number;
  encrypted: boolean;
  refs: number;
  touchedAt: number;
  disposed: boolean;
  dispose(): void;
}

/** Keep unencrypted, idle originals useful without allowing an unbounded cache. */
const MAX_IDLE_DISPLAY_BYTES = 64 * 1024 * 1024;
const displays = new Map<string, CachedDisplay>();
interface PendingDisplay {
  work: Promise<CachedDisplay>;
  /**
   * Encrypted work begun before a background transition must not publish a
   * newly decrypted URI afterwards. The source visitor is already cooperative
   * with per-screen cancellation; this generation also closes the lifecycle
   * race while native I/O is between chunk callbacks.
   */
  encryptedCacheEpoch: number | null;
}
const pending = new Map<string, PendingDisplay>();
let encryptedCacheEpoch = 0;

function displayKey(attachment: Attachment): string {
  return `${attachment.path}:${attachment.content?.generation ?? 'legacy'}`;
}

function removeDisplay(key: string, display: CachedDisplay): void {
  if (displays.get(key) === display) displays.delete(key);
  if (display.disposed) return;
  display.disposed = true;
  display.dispose();
}

function evictIdleDisplays(): void {
  const idle = [...displays.entries()]
    .filter(([, display]) => display.refs === 0)
    .sort(([, a], [, b]) => a.touchedAt - b.touchedAt);
  let idleBytes = idle.reduce((total, [, display]) => total + display.bytes, 0);
  while (idleBytes > MAX_IDLE_DISPLAY_BYTES && idle.length > 0) {
    const [key, display] = idle.shift()!;
    idleBytes -= display.bytes;
    removeDisplay(key, display);
  }
}

function acquire(key: string, display: CachedDisplay): AttachmentDisplayLease {
  display.refs++;
  display.touchedAt = Date.now();
  let released = false;
  return {
    uri: display.uri,
    release() {
      if (released) return;
      released = true;
      display.refs = Math.max(0, display.refs - 1);
      display.touchedAt = Date.now();
      // Password-protected output must not survive a page's lease.
      if (display.encrypted && display.refs === 0) removeDisplay(key, display);
      else evictIdleDisplays();
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Attachment display materialization cancelled');
}

async function createNativeDisplay(
  store: LocalStore,
  attachment: Attachment,
  derivedKey?: Uint8Array,
  signal?: AbortSignal,
): Promise<CachedDisplay> {
  const visit = store.forEachAttachmentDisplayChunk;
  if (!visit) throw new Error('Streaming attachment display is unavailable');

  const cacheDir = new Directory(Paths.cache, 'canto-display');
  if (!cacheDir.exists) cacheDir.create({ intermediates: true, idempotent: true });
  const output = new File(cacheDir, generateUUID());
  output.create({ intermediates: true });
  const handle = output.open();
  let bytes = 0;
  try {
    await visit(
      attachment,
      async (_index, base64) => {
        throwIfAborted(signal);
        const chunk = base64ToUint8(base64);
        bytes += chunk.length;
        handle.writeBytes(chunk);
        throwIfAborted(signal);
      },
      attachment.encrypted ? derivedKey : undefined,
    );
    handle.close();
    if (attachment.content && bytes !== attachment.content.byteLength) {
      throw new Error(`Attachment display length mismatch: ${attachment.name}`);
    }
  } catch (error) {
    try {
      handle.close();
    } catch {
      // The handle may already have been closed by a native error.
    }
    if (output.exists) output.delete();
    throw error;
  }
  return {
    uri: output.uri,
    bytes,
    encrypted: attachment.encrypted,
    refs: 0,
    touchedAt: Date.now(),
    disposed: false,
    dispose: () => {
      if (output.exists) output.delete();
    },
  };
}

async function createWebDisplay(
  store: LocalStore,
  attachment: Attachment,
  derivedKey?: Uint8Array,
  signal?: AbortSignal,
): Promise<CachedDisplay> {
  const visit = store.forEachAttachmentDisplayChunk;
  if (!visit) throw new Error('Streaming attachment display is unavailable');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  await visit(
    attachment,
    async (_index, base64) => {
      throwIfAborted(signal);
      const chunk = base64ToUint8(base64);
      chunks.push(chunk);
      bytes += chunk.length;
      throwIfAborted(signal);
    },
    attachment.encrypted ? derivedKey : undefined,
  );
  if (attachment.content && bytes !== attachment.content.byteLength) {
    throw new Error(`Attachment display length mismatch: ${attachment.name}`);
  }
  // Copy into ordinary ArrayBuffer-backed views: the DOM Blob type excludes
  // SharedArrayBuffer even though the decoder only returns ordinary bytes.
  const uri = URL.createObjectURL(
    new Blob(
      chunks.map((chunk) => new Uint8Array(chunk)),
      { type: 'image/*' },
    ),
  );
  return {
    uri,
    bytes,
    encrypted: attachment.encrypted,
    refs: 0,
    touchedAt: Date.now(),
    disposed: false,
    dispose: () => URL.revokeObjectURL(uri),
  };
}

/**
 * Materialize a page image into a leased URI. Chunked source data crosses this
 * boundary one stored chunk at a time; the carousel never receives base64.
 */
export async function materializeAttachmentDisplay(
  store: LocalStore,
  attachment: Attachment,
  derivedKey?: Uint8Array,
  signal?: AbortSignal,
): Promise<AttachmentDisplayLease> {
  const key = displayKey(attachment);
  const existing = displays.get(key);
  if (existing) return acquire(key, existing);

  let inFlight = pending.get(key);
  if (!inFlight) {
    const work =
      Platform.OS === 'web'
        ? createWebDisplay(store, attachment, derivedKey, signal)
        : createNativeDisplay(store, attachment, derivedKey, signal);
    inFlight = {
      work,
      encryptedCacheEpoch: attachment.encrypted ? encryptedCacheEpoch : null,
    };
    pending.set(key, inFlight);
  }
  try {
    const display = await inFlight.work;
    if (
      display.encrypted &&
      inFlight.encryptedCacheEpoch !== null &&
      inFlight.encryptedCacheEpoch !== encryptedCacheEpoch
    ) {
      // A background transition occurred while native/web materialization was
      // in flight. Dispose the completed opaque file/blob rather than publish
      // decrypted bytes into the post-background cache.
      removeDisplay(key, display);
      throw new Error('Attachment display materialization cancelled');
    }
    displays.set(key, display);
    return acquire(key, display);
  } finally {
    if (pending.get(key) === inFlight) pending.delete(key);
  }
}

/** Release all completed display files, for journal lock/logout and tests. */
export function purgeAttachmentDisplayCache(): void {
  for (const [key, display] of displays) removeDisplay(key, display);
}

/**
 * Backgrounding does not necessarily trigger the configured journal lock, but
 * password-encrypted originals must never remain leased in the app cache while
 * the app is inactive. Plain originals retain the bounded idle LRU policy.
 */
export function purgeEncryptedAttachmentDisplayCache(): void {
  encryptedCacheEpoch++;
  for (const [key, display] of displays) {
    if (display.encrypted) removeDisplay(key, display);
  }
}

/** Remove opaque files orphaned by a process death before any journal unlocks. */
export function scavengeAttachmentDisplayCache(): void {
  if (Platform.OS === 'web') return;
  try {
    const cacheDir = new Directory(Paths.cache, 'canto-display');
    if (!cacheDir.exists) return;
    for (const entry of cacheDir.list()) {
      if (entry instanceof File && entry.exists) entry.delete();
    }
  } catch {
    // A cache cleanup failure must never block the app from opening journals.
  }
}
