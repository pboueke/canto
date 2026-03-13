import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PasswordEncryptionProvider } from './types';
import { aesGcmEncrypt, aesGcmDecrypt } from './utils';

/** OWASP 2023 minimum for PBKDF2-SHA256 */
const PBKDF2_ITERATIONS = 20_000;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a 256-bit encryption key from a password and salt using PBKDF2-SHA256.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  return pbkdf2Async(sha256, encoder.encode(password), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LENGTH,
  });
}

const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password: string): {
  valid: boolean;
  reason?: string;
} {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  return { valid: true };
}

export function createPasswordEncryption(): PasswordEncryptionProvider {
  return {
    async encrypt(plaintext: string, password: string, salt: Uint8Array): Promise<string> {
      const key = await deriveKey(password, salt);
      const result = aesGcmEncrypt(plaintext, key);
      key.fill(0); // zero key material
      return result;
    },

    async decrypt(ciphertext: string, password: string, salt: Uint8Array): Promise<string> {
      const key = await deriveKey(password, salt);
      try {
        const result = aesGcmDecrypt(ciphertext, key);
        return result;
      } finally {
        key.fill(0); // zero key material
      }
    },
  };
}
