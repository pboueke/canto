import { getRandomBytes } from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';

const NONCE_LENGTH = 12;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64([12-byte nonce][ciphertext][16-byte GCM tag]).
 * A unique nonce is generated via CSPRNG for every call.
 */
export function aesGcmEncrypt(plaintext: string, key: Uint8Array): string {
  const nonce = getRandomBytes(NONCE_LENGTH);
  const plaintextBytes = textEncoder.encode(plaintext);

  const cipher = gcm(key, nonce);
  const ciphertextWithTag = cipher.encrypt(plaintextBytes);

  // Prepend nonce: [nonce][ciphertext+tag]
  const result = new Uint8Array(NONCE_LENGTH + ciphertextWithTag.length);
  result.set(nonce, 0);
  result.set(ciphertextWithTag, NONCE_LENGTH);

  return uint8ToBase64(result);
}

/**
 * Decrypt base64([12-byte nonce][ciphertext][16-byte GCM tag]) with AES-256-GCM.
 * Throws if authentication fails (tampered data).
 */
export function aesGcmDecrypt(ciphertext: string, key: Uint8Array): string {
  const data = base64ToUint8(ciphertext);

  if (data.length < NONCE_LENGTH + 16) {
    throw new Error('Invalid ciphertext: too short');
  }

  const nonce = data.slice(0, NONCE_LENGTH);
  const ciphertextWithTag = data.slice(NONCE_LENGTH);

  const cipher = gcm(key, nonce);
  const plaintext = cipher.decrypt(ciphertextWithTag);

  return textDecoder.decode(plaintext);
}

/**
 * Generate a cryptographically random salt.
 */
export function generateSalt(length: number = 16): Uint8Array {
  return getRandomBytes(length);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
