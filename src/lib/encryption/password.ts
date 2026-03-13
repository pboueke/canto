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

export type PasswordStrength = 'weak' | 'fair' | 'strong';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  reasons: string[];
}

const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SPECIAL = /[^a-zA-Z0-9]/;

/**
 * Evaluate password strength on a three-level scale.
 *
 * Criteria (each met = +1 point):
 *   1. Length >= 8
 *   2. Length >= 12
 *   3. Contains lowercase letter
 *   4. Contains uppercase letter
 *   5. Contains digit
 *   6. Contains special character (!@#$%… or any non-alphanumeric)
 *
 * Scoring:
 *   0-2  → weak   (red)
 *   3-4  → fair   (yellow)
 *   5-6  → strong (green)
 *
 * "strong" requires at minimum: length >= 12, mixed case, digit AND special char.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length === 0) {
    return { strength: 'weak', reasons: [] };
  }

  const reasons: string[] = [];
  let score = 0;

  if (password.length >= 8) {
    score++;
  } else {
    reasons.push('min8');
  }

  if (password.length >= 12) {
    score++;
  } else {
    reasons.push('min12');
  }

  if (HAS_LOWERCASE.test(password)) {
    score++;
  } else {
    reasons.push('lowercase');
  }

  if (HAS_UPPERCASE.test(password)) {
    score++;
  } else {
    reasons.push('uppercase');
  }

  if (HAS_DIGIT.test(password)) {
    score++;
  } else {
    reasons.push('digit');
  }

  if (HAS_SPECIAL.test(password)) {
    score++;
  } else {
    reasons.push('special');
  }

  let strength: PasswordStrength;
  if (score <= 2) {
    strength = 'weak';
  } else if (score <= 4) {
    strength = 'fair';
  } else {
    strength = 'strong';
  }

  return { strength, reasons };
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
