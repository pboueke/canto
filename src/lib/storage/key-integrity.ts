import { aesGcmDecrypt } from '@/lib/encryption/utils';

/**
 * Canto 0.20.0 and earlier could persist a page, catalog, or metadata password
 * layer under an auto-locked key buffer that had already been zeroed in place.
 * The data is intact; it is simply wrapped with 32 zero bytes. This key is
 * only ever used to *read* such records during explicit recovery — every write
 * path still rejects an all-zero key (see assertUsableDerivedKey).
 *
 * One shared instance keeps the imported AES key cache bounded.
 */
const LEGACY_ZERO_KEY = new Uint8Array(32);

/** Which password layer protects one record, after device decryption succeeded. */
export type PasswordLayer =
  /** Decrypts with the supplied journal key. */
  | 'real'
  /** Decrypts only with the legacy all-zero key. */
  | 'legacy-zero'
  /** Plain JSON beneath the device layer (no password layer). */
  | 'device-only'
  /** Password-layered, but neither key opens it. */
  | 'undecryptable';

export interface PasswordLayerRead {
  layer: PasswordLayer;
  /** Plaintext for every layer except `undecryptable`. */
  value?: string;
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

async function tryDecrypt(ciphertext: string, key: Uint8Array): Promise<string | null> {
  try {
    return await aesGcmDecrypt(ciphertext, key);
  } catch {
    return null;
  }
}

/**
 * Classify the password layer of one device-decrypted record. The supplied key
 * is tried first, so a correctly protected record never pays for the legacy
 * probe. The zero key is never accepted as the supplied key.
 */
export async function classifyPasswordLayer(
  deviceDecrypted: string,
  derivedKey?: Uint8Array,
): Promise<PasswordLayerRead> {
  if (derivedKey && !isZeroKey(derivedKey)) {
    const value = await tryDecrypt(deviceDecrypted, derivedKey);
    if (value !== null) return { layer: 'real', value };
  }
  if (isJson(deviceDecrypted)) return { layer: 'device-only', value: deviceDecrypted };
  const legacy = await tryDecrypt(deviceDecrypted, LEGACY_ZERO_KEY);
  if (legacy !== null) return { layer: 'legacy-zero', value: legacy };
  return { layer: 'undecryptable' };
}

/** Decrypt a legacy attachment frame or payload wrapped with the zero key. */
export async function decryptLegacyZeroKey(ciphertext: string): Promise<string | null> {
  return tryDecrypt(ciphertext, LEGACY_ZERO_KEY);
}

export function isZeroKey(key: Uint8Array): boolean {
  return key.length === 32 && key.every((byte) => byte === 0);
}

/**
 * Result of strictly checking a journal password against its stored records.
 * `unverifiable`: every password-layered record was written under the legacy
 * zero key, so no record can confirm or refute this key. Nothing may be
 * re-encrypted under such a key.
 */
export type JournalKeyVerdict = 'valid' | 'invalid' | 'unverifiable';

/** One device-decrypted record offered as password evidence, or null when unreadable. */
export type KeyEvidence = () => Promise<string | null>;

/**
 * Decide whether a derived key is the journal's real password key without the
 * device-only fallback that ordinary reads use. Metadata is the primary
 * evidence. Legacy journals whose metadata has no password layer (or whose
 * metadata was wrapped with the zero key) fall back to the catalog and page
 * records: any record that opens with the key proves it. A journal with no
 * password-layered record at all cannot be wrong.
 */
export async function verifyKeyAgainstRecords(
  metadata: string,
  journalId: string,
  derivedKey: Uint8Array,
  otherRecords: readonly KeyEvidence[],
): Promise<JournalKeyVerdict> {
  if (isZeroKey(derivedKey)) return 'invalid';
  const metadataLayer = await classifyPasswordLayer(metadata, derivedKey);
  if (metadataLayer.layer === 'real') {
    try {
      const parsed = JSON.parse(metadataLayer.value!) as { id?: unknown };
      return parsed.id === journalId ? 'valid' : 'invalid';
    } catch {
      return 'invalid';
    }
  }
  if (metadataLayer.layer === 'undecryptable') return 'invalid';
  let undecryptable = false;
  let legacyOnly = metadataLayer.layer === 'legacy-zero';
  for (const read of otherRecords) {
    const record = await read();
    if (record === null) continue;
    const layer = await classifyPasswordLayer(record, derivedKey);
    if (layer.layer === 'real') return 'valid';
    if (layer.layer === 'undecryptable') undecryptable = true;
    // A zero-key record proves nothing about the supplied key.
    if (layer.layer === 'legacy-zero') legacyOnly = true;
  }
  if (undecryptable) return 'invalid';
  // Only zero-key password layers exist: no record can tell a right password
  // from a wrong one. A journal with no password layer at all opens with any key.
  return legacyOnly ? 'unverifiable' : 'valid';
}

/** Counts-only classification of one journal's records. Never carries content. */
export interface RecordLayerCounts {
  total: number;
  deviceFailed: number;
  real: number;
  legacyZero: number;
  deviceOnly: number;
  undecryptable: number;
  /** Password-layered records not opened because no key was supplied. */
  notOpenedWithoutKey: number;
  invalidJson: number;
}

export function emptyLayerCounts(): RecordLayerCounts {
  return {
    total: 0,
    deviceFailed: 0,
    real: 0,
    legacyZero: 0,
    deviceOnly: 0,
    undecryptable: 0,
    notOpenedWithoutKey: 0,
    invalidJson: 0,
  };
}

/** Add one record to a counts-only summary. `null` means the device layer failed. */
export async function countRecordLayer(
  counts: RecordLayerCounts,
  deviceDecrypted: string | null,
  derivedKey?: Uint8Array,
): Promise<void> {
  counts.total++;
  if (deviceDecrypted === null) {
    counts.deviceFailed++;
    return;
  }
  const read = await classifyPasswordLayer(deviceDecrypted, derivedKey);
  if (read.layer === 'real') counts.real++;
  else if (read.layer === 'legacy-zero') counts.legacyZero++;
  else if (read.layer === 'device-only') counts.deviceOnly++;
  else if (derivedKey) counts.undecryptable++;
  // Without a key a password layer is expected, not a failure.
  else counts.notOpenedWithoutKey++;
  if (read.value !== undefined && !isJson(read.value)) counts.invalidJson++;
}

/**
 * Support diagnostics: counts and states only. No titles, ids, paths, page
 * content, or key material may ever be added here; the object is meant to be
 * copied into a support message by the user.
 */
export interface StorageDiagnostics {
  format: 'canto-diagnostics-v1';
  platform: string;
  index: 'valid' | 'absent' | 'unreadable';
  indexedJournals: number;
  unindexedJournalDirectories: number;
  pendingTransactions: number;
  pendingImports: number;
  rotationCompletionMarker: boolean;
  journal?: {
    keySupplied: boolean;
    metadata: RecordLayerCounts;
    catalog: RecordLayerCounts;
    pages: RecordLayerCounts;
    drafts: number;
  };
}
