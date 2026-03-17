import { gcm } from '@noble/ciphers/aes.js';

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

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
 * Encrypt plaintext with AES-256-GCM, returning raw bytes.
 * Returns Uint8Array([12-byte nonce][ciphertext][16-byte GCM tag]).
 * Use this for binary storage (e.g. ZIP files) to avoid base64/string
 * round-trips that can be corrupted by JSZip compression on Hermes.
 */
export function aesGcmEncryptBytes(plaintext: string, key: Uint8Array): Uint8Array {
  const nonce = getRandomBytes(NONCE_LENGTH);
  const plaintextBytes = textEncoder.encode(plaintext);

  const cipher = gcm(key, nonce);
  const ciphertextWithTag = cipher.encrypt(plaintextBytes);

  const result = new Uint8Array(NONCE_LENGTH + ciphertextWithTag.length);
  result.set(nonce, 0);
  result.set(ciphertextWithTag, NONCE_LENGTH);

  return result;
}

/**
 * Decrypt raw bytes ([12-byte nonce][ciphertext][16-byte GCM tag]) with AES-256-GCM.
 * Counterpart to aesGcmEncryptBytes — operates on Uint8Array directly.
 */
export function aesGcmDecryptBytes(data: Uint8Array, key: Uint8Array): string {
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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
B64_LOOKUP.fill(255);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function uint8ToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    result += B64[a >> 2];
    result += B64[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? B64[c & 63] : '=';
  }
  return result;
}

export function base64ToUint8(base64: string): Uint8Array {
  // Strip non-base64 characters (whitespace, BOM, null bytes) that
  // Hermes's strict atob() rejects but JSZip decompression may introduce.
  const str = base64.replace(/[^A-Za-z0-9+/=]/g, '');

  let padding = 0;
  if (str.endsWith('==')) padding = 2;
  else if (str.endsWith('=')) padding = 1;

  const outLen = (str.length * 3) / 4 - padding;
  const out = new Uint8Array(outLen);

  let j = 0;
  for (let i = 0; i < str.length; i += 4) {
    const a = B64_LOOKUP[str.charCodeAt(i)];
    const b = B64_LOOKUP[str.charCodeAt(i + 1)];
    const c = B64_LOOKUP[str.charCodeAt(i + 2)];
    const d = B64_LOOKUP[str.charCodeAt(i + 3)];
    out[j++] = (a << 2) | (b >> 4);
    if (j < outLen) out[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < outLen) out[j++] = ((c & 3) << 6) | d;
  }
  return out;
}
