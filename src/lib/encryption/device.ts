import * as SecureStore from 'expo-secure-store';
import type { EncryptionProvider } from './types';
import { aesGcmEncrypt, aesGcmDecrypt, releaseAndZeroAesKey } from './utils';

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

const DEVICE_KEY_ALIAS = 'canto_device_encryption_key';
const PREVIOUS_DEVICE_KEY_ALIAS = 'canto_device_encryption_previous_key';

let keyCreationPromise: Promise<Uint8Array> | null = null;

async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  if (!keyCreationPromise) {
    keyCreationPromise = (async () => {
      const existing = await SecureStore.getItemAsync(DEVICE_KEY_ALIAS);
      if (existing) {
        return hexToBytes(existing);
      }

      // Generate a 256-bit key via CSPRNG
      const key = getRandomBytes(32);
      await SecureStore.setItemAsync(DEVICE_KEY_ALIAS, bytesToHex(key));
      return key;
    })().catch((err) => {
      keyCreationPromise = null;
      throw err;
    });
  }
  return keyCreationPromise;
}

/** Generate a new device key without persisting it. Call commitKeyRotation() after re-encryption succeeds. */
export async function prepareKeyRotation(): Promise<{ oldKey: Uint8Array; newKey: Uint8Array }> {
  const existingHex = await SecureStore.getItemAsync(DEVICE_KEY_ALIAS);
  const oldKey = existingHex ? hexToBytes(existingHex) : getRandomBytes(32);
  const newKey = getRandomBytes(32);
  return { oldKey, newKey };
}

/**
 * Begin the durable device-key cutover before storage can publish new
 * ciphertext. The previous key remains in SecureStore only until commit, so a
 * restart can decrypt either side of a staged storage transaction. Call
 * abortKeyRotation when data staging fails before its durable commit point.
 */
export async function beginKeyRotation(oldKey: Uint8Array, newKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(PREVIOUS_DEVICE_KEY_ALIAS, bytesToHex(oldKey));
  await SecureStore.setItemAsync(DEVICE_KEY_ALIAS, bytesToHex(newKey));
  keyCreationPromise = null;
}

/** Restore the old key when data staging did not reach its durable commit point. */
export async function abortKeyRotation(): Promise<void> {
  const previous = await SecureStore.getItemAsync(PREVIOUS_DEVICE_KEY_ALIAS);
  if (previous) await SecureStore.setItemAsync(DEVICE_KEY_ALIAS, previous);
  await SecureStore.deleteItemAsync(PREVIOUS_DEVICE_KEY_ALIAS);
  keyCreationPromise = null;
}

/**
 * Resolve a restart between beginKeyRotation and the storage commit marker.
 * Without the marker, the current key must be restored before any retry can
 * replace the only fallback capable of reading the old ciphertext.
 */
export async function recoverKeyRotation(completed: boolean): Promise<void> {
  const previous = await SecureStore.getItemAsync(PREVIOUS_DEVICE_KEY_ALIAS);
  if (!previous) return;
  if (completed) {
    await finalizeCompletedKeyRotation();
  } else {
    await abortKeyRotation();
  }
}

/** Finalize a completed data transaction and securely discard the fallback key. */
export async function commitKeyRotation(newKey: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_KEY_ALIAS, bytesToHex(newKey));
  await finalizeCompletedKeyRotation();
}

/**
 * Discard a fallback key only after LocalStore has durably proved that its
 * device-data transaction committed. This is intentionally idempotent so
 * startup can retry if it crashes after removing the fallback but before
 * clearing LocalStore's completion marker.
 */
export async function finalizeCompletedKeyRotation(): Promise<void> {
  await SecureStore.deleteItemAsync(PREVIOUS_DEVICE_KEY_ALIAS);
  keyCreationPromise = null;
}

/** @internal Reset module-level state for testing only. */
export function _resetKeyCreationPromise(): void {
  keyCreationPromise = null;
}

export function createDeviceEncryption(): EncryptionProvider {
  let cachedKey: Uint8Array | null = null;

  async function getKey(): Promise<Uint8Array> {
    if (!cachedKey) {
      cachedKey = await getOrCreateDeviceKey();
    }
    return cachedKey;
  }

  return {
    async encrypt(plaintext: string): Promise<string> {
      const key = await getKey();
      return await aesGcmEncrypt(plaintext, key);
    },

    async decrypt(ciphertext: string): Promise<string> {
      const key = await getKey();
      try {
        return await aesGcmDecrypt(ciphertext, key);
      } catch (error) {
        // During a durable rotation the old committed view may still exist
        // until LocalStore replays its commit marker at startup.
        const previous = await SecureStore.getItemAsync(PREVIOUS_DEVICE_KEY_ALIAS);
        if (!previous) throw error;
        return await aesGcmDecrypt(ciphertext, hexToBytes(previous));
      }
    },

    clearKey(): void {
      if (cachedKey) {
        releaseAndZeroAesKey(cachedKey);
        cachedKey = null;
      }
      // Reset the module-level promise so the next getKey() re-reads from SecureStore
      keyCreationPromise = null;
    },
  };
}
