import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import type { EncryptionProvider } from './types';
import { aesGcmEncrypt, aesGcmDecrypt } from './utils';

const DEVICE_KEY_ALIAS = 'canto_device_encryption_key';

async function getOrCreateDeviceKey(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(DEVICE_KEY_ALIAS);
  if (existing) {
    return hexToBytes(existing);
  }

  // Generate a 256-bit key via CSPRNG
  const key = getRandomBytes(32);
  await SecureStore.setItemAsync(DEVICE_KEY_ALIAS, bytesToHex(key));
  return key;
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
      return aesGcmEncrypt(plaintext, key);
    },

    async decrypt(ciphertext: string): Promise<string> {
      const key = await getKey();
      return aesGcmDecrypt(ciphertext, key);
    },
  };
}
