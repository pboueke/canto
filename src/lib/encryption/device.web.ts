import type { EncryptionProvider } from './types';
import { aesGcmEncrypt, aesGcmDecrypt } from './utils';

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

export async function rotateKey(): Promise<{ oldKey: Uint8Array; newKey: Uint8Array }> {
  const existingHex = localStorage.getItem(DEVICE_KEY_ALIAS);
  const oldKey = existingHex ? hexToBytes(existingHex) : getRandomBytes(32);
  const newKey = getRandomBytes(32);
  localStorage.setItem(DEVICE_KEY_ALIAS, bytesToHex(newKey));
  // Reset the cached promise so the next getOrCreateDeviceKey returns the new key
  keyCreationPromise = null;
  return { oldKey, newKey };
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
      return await aesGcmDecrypt(ciphertext, key);
    },

    clearKey(): void {
      if (cachedKey) {
        cachedKey.fill(0);
        cachedKey = null;
      }
      // Reset the module-level promise so the next getKey() re-reads from SecureStore
      keyCreationPromise = null;
    },
  };
}
