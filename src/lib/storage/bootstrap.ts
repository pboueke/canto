import {
  hasDeviceKey,
  hasPendingPreviousDeviceKey,
  recoverKeyRotation,
} from '@/lib/encryption/device';
import type { LocalStore } from './types';
import { StorageIntegrityError } from './integrity';

/**
 * First-install / device-key bootstrap gate. Runs before any recovery or
 * decryption so that a missing device key can never lazily generate a new key
 * over an existing populated library.
 *
 * - No key + no durable content: a genuinely fresh install. Record the keyless
 *   first-install marker so an interrupted empty installation can be
 *   distinguished from a populated library later.
 * - No key + pending previous key from an interrupted rotation: restore the
 *   fallback before deciding the key is unavailable, so a cutover interrupted
 *   between the fallback write and the current-key write recovers instead of
 *   failing closed.
 * - No key + existing content: integrity/recovery condition (`DEVICE_KEY_UNAVAILABLE`).
 *   The app must never treat this as an empty library, never write a replacement
 *   key, and never overwrite the evidence.
 * - Key present: normal startup; nothing to record.
 */
export async function ensureDeviceKeyBootstrap(store: LocalStore): Promise<void> {
  if (await hasDeviceKey()) return;
  // beginKeyRotation persists the previous key before the current alias, so an
  // interrupted cutover can leave only the fallback. Restoring it keeps the
  // old ciphertext readable instead of declaring the key destroyed.
  if (await hasPendingPreviousDeviceKey()) {
    await recoverKeyRotation(false);
    if (await hasDeviceKey()) return;
  }
  const hasData = await store.hasExistingData();
  if (hasData) {
    throw new StorageIntegrityError(
      'DEVICE_KEY_UNAVAILABLE',
      'A device key is missing while encrypted Canto data exists; refusing to treat this as a fresh install.',
    );
  }
  await store.recordFirstInstall();
}
