import { aesGcmDecrypt, aesGcmEncrypt } from '@/lib/encryption/utils';
import type { EncryptionService } from '@/lib/encryption';
import { RotationInterruptedError } from './integrity';

/** Why a rotation refused to start. Nothing was changed in every case. */
export type RotationBlockedReason =
  /** Journal data exists that the index does not list, or an import is pending. */
  | 'UNRECOVERED_DATA'
  /** A record could not be decrypted with the current device key. */
  | 'UNREADABLE_DATA'
  /** Staging needs roughly the library's size again in free storage. */
  | 'INSUFFICIENT_SPACE'
  /** A previous rotation still has to finish on restart. */
  | 'ROTATION_PENDING'
  /** A legacy monolithic attachment is too large to re-encrypt in memory. */
  | 'UNSUPPORTED_DATA'
  /** Web: another tab is open on the same library and device key. */
  | 'OTHER_TABS_OPEN';

/** Page records per journal that verification trial-decrypts with the new key. */
const VERIFY_PAGE_SAMPLE = 10;

/**
 * Select which rotated records verification trial-decrypts with the new key:
 * the index, every journal's metadata and catalog, and a bounded sample of
 * page records per journal. Attachments, drafts, and markers are skipped.
 */
export function createRotationVerifySampler(): (path: string) => boolean {
  const pagesPerJournal = new Map<string, number>();
  return (path) => {
    if (
      path.endsWith('/journals.json') ||
      path.endsWith('/metadata.json') ||
      path.endsWith('/page-catalog.json')
    ) {
      return true;
    }
    const marker = path.lastIndexOf('/pages/');
    if (marker < 0 || !path.endsWith('.json')) return false;
    const journal = path.slice(0, marker);
    const sampled = pagesPerJournal.get(journal) ?? 0;
    if (sampled >= VERIFY_PAGE_SAMPLE) return false;
    pagesPerJournal.set(journal, sampled + 1);
    return true;
  };
}

/** A rotation was refused before any key or ciphertext changed. */
export class RotationBlockedError extends Error {
  readonly reason: RotationBlockedReason;

  constructor(reason: RotationBlockedReason, message: string) {
    super(message);
    this.name = 'RotationBlockedError';
    this.reason = reason;
  }
}

/**
 * Durable device-key operations (expo-secure-store on native, localStorage on
 * web). Injected so the store never imports a platform key module directly.
 */
export interface DeviceKeyCustody {
  hasPendingPreviousDeviceKey(): Promise<boolean>;
  prepareKeyRotation(): Promise<{ oldKey: Uint8Array; newKey: Uint8Array }>;
  beginKeyRotation(oldKey: Uint8Array, newKey: Uint8Array): Promise<void>;
  abortKeyRotation(): Promise<void>;
  commitKeyRotation(newKey: Uint8Array): Promise<void>;
}

/**
 * Platform storage steps of one rotation. Every step is idempotent with
 * respect to startup recovery: before `markCommitting` the staged copy is
 * invisible; after it, startup replays the staged copy byte for byte.
 */
export interface DeviceKeyRotationIO {
  /** Refuse (RotationBlockedError) unless every journal record is rotatable. */
  preflight(): Promise<void>;
  /** Stage re-encrypted copies of every record plus the completion marker. */
  stage(
    oldDecrypt: (ciphertext: string) => Promise<string>,
    newEncrypt: (plaintext: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void>;
  /** Delete an uncommitted staging copy. */
  discard(): Promise<void>;
  /** Persist the durable commit point. */
  markCommitting(): Promise<void>;
  /** Re-read the marker after a failed commit write; unknown counts as committed. */
  isCommitting(): Promise<boolean>;
  /** Copy every staged record over its target. */
  apply(): Promise<void>;
  /** Prove every target equals its staged copy and the index opens with the new key. */
  verify(newKey: Uint8Array): Promise<void>;
  /** Remove the transaction after verification. */
  cleanup(): Promise<void>;
  /**
   * Remove the keyless completion proof once the fallback key is gone.
   * Preflight also clears a stale one: with no fallback key pending, a
   * leftover marker would make a later crash look like a finished rotation.
   */
  clearCompletionMarker(): Promise<void>;
  /** Refuse every later write until restart (see RotationInterruptedError). */
  seal(): void;
}

/**
 * Rotate the device key without ever discarding a key that on-disk ciphertext
 * still needs.
 *
 * 1. Preflight and stage while only the old key is current. Any failure here
 *    discards the staging copy; keys were never touched.
 * 2. Persist PREVIOUS=old, CURRENT=new and swap the cached device key while
 *    the write barrier still holds every queued writer.
 * 3. Cross the commit point. From here on the old key is kept until the new
 *    ciphertext has been applied and verified. A failure seals the store and
 *    leaves both keys so startup replay can finish (or, if the commit point
 *    was never durably written, roll back to the old key).
 * 4. Only after verification is the fallback key deleted.
 */
export async function runDeviceKeyRotation(
  io: DeviceKeyRotationIO,
  custody: DeviceKeyCustody,
  encryption: EncryptionService,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  if (await custody.hasPendingPreviousDeviceKey()) {
    throw new RotationBlockedError(
      'ROTATION_PENDING',
      'A previous device-key rotation must finish before another can start.',
    );
  }
  await io.preflight();

  const { oldKey, newKey } = await custody.prepareKeyRotation();
  const oldDecrypt = async (ciphertext: string) => {
    try {
      return await encryption.decrypt(ciphertext);
    } catch {
      // The cached current key may predate an earlier, partially applied
      // rotation; the durable current key is the last authority.
      return await aesGcmDecrypt(ciphertext, oldKey);
    }
  };
  const newEncrypt = (plaintext: string) => aesGcmEncrypt(plaintext, newKey);

  try {
    await io.stage(oldDecrypt, newEncrypt, onProgress);
  } catch (error) {
    await io.discard();
    throw error;
  }

  /**
   * Restore the old current key after a failure before the commit point. If
   * even that fails, the durable keys are uncertain: refuse every write until
   * restart, where recovery rolls back to the old key. The cached device key
   * still holds the old key, so nothing was written under the new one.
   */
  const rollBack = async () => {
    try {
      await custody.abortKeyRotation();
    } catch {
      io.seal();
      throw new RotationInterruptedError();
    }
    encryption.clearSession();
    await io.discard();
  };

  try {
    await custody.beginKeyRotation(oldKey, newKey);
  } catch (error) {
    // Nothing references the new key yet; restore the old current alias.
    await rollBack();
    throw error;
  }

  try {
    await io.markCommitting();
  } catch (error) {
    if (!(await io.isCommitting().catch(() => true))) {
      await rollBack();
      throw error;
    }
    io.seal();
    throw new RotationInterruptedError();
  }
  // Past the commit point. Queued writers resume only after this operation
  // returns; swapping the cached device key now means none of them can write
  // under the old key that is about to be retired, while no write could ever
  // land under the new key if the cutover had been rolled back. Reads keep
  // falling back to PREVIOUS.
  encryption.clearSession();

  try {
    try {
      await io.apply();
    } catch {
      // One in-process retry covers a transient write failure; replay is
      // byte-identical and idempotent.
      await io.apply();
    }
    await io.verify(newKey);
    await io.cleanup();
  } catch {
    // Past the commit point: never abort. Both keys remain durable, so every
    // record stays readable, and startup replays the committed transaction.
    io.seal();
    throw new RotationInterruptedError();
  }

  try {
    await custody.commitKeyRotation(newKey);
  } catch (error) {
    // Data is fully rotated and verified, and new writes already use the new
    // key. Keep the completion marker: startup finalization uses it to discard
    // the fallback. Clearing it here would make startup restore the old key.
    console.warn('[Canto] Device-key fallback cleanup deferred to next startup:', error);
    return;
  }
  try {
    await io.clearCompletionMarker();
  } catch (error) {
    // The rotation succeeded. The next rotation's preflight clears a stale
    // marker before any key changes, so a leftover marker is harmless.
    console.warn('[Canto] Device-key completion marker cleanup deferred:', error);
  }
  encryption.clearSession();
}
