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

if (typeof window !== 'undefined') {
  console.warn(
    '[Canto] Web platform: device encryption key is stored in localStorage. ' +
      'This is less secure than native keychain storage. ' +
      'Use password-protected journals for sensitive data.',
  );
}

let keyCreationPromise: Promise<Uint8Array> | null = null;

async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  if (!keyCreationPromise) {
    keyCreationPromise = (async () => {
      const existing = localStorage.getItem(DEVICE_KEY_ALIAS);
      if (existing) {
        return hexToBytes(existing);
      }

      const key = getRandomBytes(32);
      localStorage.setItem(DEVICE_KEY_ALIAS, bytesToHex(key));
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
  const existingHex = localStorage.getItem(DEVICE_KEY_ALIAS);
  const oldKey = existingHex ? hexToBytes(existingHex) : getRandomBytes(32);
  const newKey = getRandomBytes(32);
  return { oldKey, newKey };
}

/** Persist a fallback key before the staged storage transaction can commit. Call abortKeyRotation if staging fails. */
export async function beginKeyRotation(oldKey: Uint8Array, newKey: Uint8Array): Promise<void> {
  localStorage.setItem(PREVIOUS_DEVICE_KEY_ALIAS, bytesToHex(oldKey));
  localStorage.setItem(DEVICE_KEY_ALIAS, bytesToHex(newKey));
  keyCreationPromise = null;
}

/** Restore the old key when data staging did not reach its durable commit point. */
export async function abortKeyRotation(): Promise<void> {
  const previous = localStorage.getItem(PREVIOUS_DEVICE_KEY_ALIAS);
  if (previous) localStorage.setItem(DEVICE_KEY_ALIAS, previous);
  localStorage.removeItem(PREVIOUS_DEVICE_KEY_ALIAS);
  keyCreationPromise = null;
}

/**
 * Resolve a restart between beginKeyRotation and the storage commit marker.
 * Without the marker, restore the prior key before a retry can overwrite the
 * only key that decrypts the old committed data.
 */
export async function recoverKeyRotation(completed: boolean): Promise<void> {
  const previous = localStorage.getItem(PREVIOUS_DEVICE_KEY_ALIAS);
  if (!previous) return;
  if (completed) {
    await finalizeCompletedKeyRotation();
  } else {
    await abortKeyRotation();
  }
}

/** Finalize a completed data transaction and discard the fallback key. */
export async function commitKeyRotation(newKey: Uint8Array): Promise<void> {
  localStorage.setItem(DEVICE_KEY_ALIAS, bytesToHex(newKey));
  await finalizeCompletedKeyRotation();
}

/**
 * Discard a fallback key only after LocalStore has durably proved that its
 * device-data transaction committed. This is idempotent so startup recovery
 * can safely retry across a crash between key finalization and marker cleanup.
 */
export async function finalizeCompletedKeyRotation(): Promise<void> {
  localStorage.removeItem(PREVIOUS_DEVICE_KEY_ALIAS);
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
        const previous = localStorage.getItem(PREVIOUS_DEVICE_KEY_ALIAS);
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
