/**
 * Typed integrity outcomes for local journal persistence.
 *
 * Reads distinguish three states — absent, valid, and unreadable — and
 * mutation paths fail closed by throwing a StorageIntegrityError instead of
 * publishing an empty or reduced projection of authoritative user data.
 */

/** Which layer of an existing record failed to be read. */
export type StorageIntegrityCause =
  | 'DEVICE_DECRYPT_FAILED'
  | 'PASSWORD_DECRYPT_FAILED'
  | 'JSON_PARSE_FAILED'
  | 'VALIDATION_FAILED'
  | 'MISSING_PAGE_FILE'
  | 'INDEX_ABSENT';

/** Machine-readable integrity/recovery codes surfaced to hooks and UI. */
export type IntegrityCode =
  | 'INDEX_UNREADABLE'
  | 'CATALOG_UNREADABLE'
  | 'JOURNAL_UNREADABLE'
  | 'DEVICE_KEY_UNAVAILABLE'
  | 'JOURNAL_LOCKED';

export interface StorageIntegrityErrorOptions {
  /** Which layer of the record failed to be read. */
  cause?: StorageIntegrityCause;
  /** Journal whose projection could not be trusted. */
  journalId?: string;
  /**
   * Opaque record identifiers (never plaintext content, keys, or paths that
   * could reveal sensitive names). Safe to render in a recovery diagnostic.
   */
  details?: string[];
}

/** A record existed but could not be trusted. Never treat it as deleted. */
export class StorageIntegrityError extends Error {
  readonly code: IntegrityCode;
  readonly causeLayer: StorageIntegrityCause | undefined;
  readonly journalId: string | undefined;
  readonly details: string[];

  constructor(code: IntegrityCode, message: string, options: StorageIntegrityErrorOptions = {}) {
    super(message);
    this.name = 'StorageIntegrityError';
    this.code = code;
    this.causeLayer = options.cause;
    this.journalId = options.journalId;
    this.details = options.details ?? [];
  }
}

/** A journal's derived key was revoked (auto-lock) before mutation. */
export class JournalLockedError extends StorageIntegrityError {
  constructor(message = 'Journal is locked; unlock before saving.') {
    super('JOURNAL_LOCKED', message);
    this.name = 'JournalLockedError';
  }
}

/**
 * Three-state read result for a projection file (journals.json or
 * page-catalog.json). `absent` is expected only for a genuinely new root.
 */
export type IndexedRead<T> =
  | { state: 'absent' }
  | { state: 'valid'; value: T }
  | { state: 'unreadable'; cause: StorageIntegrityCause };

/**
 * Guard used by the password-layer encryption paths. A revoked
 * (auto-locked) key has been zeroed in place, so any mutation that still
 * holds the same buffer must be rejected before it touches storage.
 * This is a defense in depth; the lease check in the key context is the
 * primary authorization boundary.
 */
export function assertUsableDerivedKey(derivedKey?: Uint8Array | null): void {
  if (derivedKey && derivedKey.length === 32 && derivedKey.every((byte) => byte === 0)) {
    throw new JournalLockedError();
  }
}

/**
 * Require a non-null, non-zeroed derived key for a write that must preserve
 * the password layer. An encrypted attachment or a secure journal whose key
 * is unavailable must never be persisted as device-only data; returning the
 * key here lets the caller encrypt the payload unconditionally.
 */
export function requireUsableDerivedKey(derivedKey?: Uint8Array | null): Uint8Array {
  assertUsableDerivedKey(derivedKey);
  if (!derivedKey) {
    throw new JournalLockedError('Journal is locked; unlock before saving.');
  }
  return derivedKey;
}
