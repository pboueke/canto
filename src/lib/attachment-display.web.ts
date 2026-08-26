import type { Attachment } from 'canto-data';
import type { LocalStore } from '@/lib/storage';
import { base64ToUint8 } from '@/lib/encryption/utils';

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

const MAX_IDLE_DISPLAY_BYTES = 64 * 1024 * 1024;
const displays = new Map<string, CachedDisplay>();
interface PendingDisplay {
  work: Promise<CachedDisplay>;
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
      if (display.encrypted && display.refs === 0) removeDisplay(key, display);
      else evictIdleDisplays();
    },
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('Attachment display materialization cancelled');
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

/** Materialize an attachment as a browser Object URL and lease it to the caller. */
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
    inFlight = {
      work: createWebDisplay(store, attachment, derivedKey, signal),
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
      removeDisplay(key, display);
      throw new Error('Attachment display materialization cancelled');
    }
    displays.set(key, display);
    return acquire(key, display);
  } finally {
    if (pending.get(key) === inFlight) pending.delete(key);
  }
}

export function purgeAttachmentDisplayCache(): void {
  for (const [key, display] of displays) removeDisplay(key, display);
}

export function purgeEncryptedAttachmentDisplayCache(): void {
  encryptedCacheEpoch++;
  for (const [key, display] of displays) {
    if (display.encrypted) removeDisplay(key, display);
  }
}

/** Browser object URLs are process-scoped and need no startup filesystem sweep. */
export function scavengeAttachmentDisplayCache(): void {}
