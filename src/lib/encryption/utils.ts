import { aesEncryptAsync, aesDecryptAsync, AESEncryptionKey, AESSealedData } from 'expo-crypto';

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Yield the JS thread so touch events and animations can be processed. */
const yieldThread = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns base64([12-byte nonce][ciphertext][16-byte GCM tag]).
 * A unique nonce is generated via CSPRNG for every call.
 */
export async function aesGcmEncrypt(plaintext: string, key: Uint8Array): Promise<string> {
  if (key.length !== 32) throw new Error(`Invalid AES key: expected 32 bytes, got ${key.length}`);
  const aesKey = await AESEncryptionKey.import(key);
  const sealed = await aesEncryptAsync(textEncoder.encode(plaintext), aesKey);
  const combined = await sealed.combined();
  await yieldThread();
  return uint8ToBase64(combined);
}

/**
 * Decrypt base64([12-byte nonce][ciphertext][16-byte GCM tag]) with AES-256-GCM.
 * Throws if authentication fails (tampered data).
 */
export async function aesGcmDecrypt(ciphertext: string, key: Uint8Array): Promise<string> {
  if (key.length !== 32) throw new Error(`Invalid AES key: expected 32 bytes, got ${key.length}`);
  await yieldThread();
  const data = base64ToUint8(ciphertext);

  if (data.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  const sealed = AESSealedData.fromCombined(data);
  const aesKey = await AESEncryptionKey.import(key);
  const result = await aesDecryptAsync(sealed, aesKey);

  await yieldThread();
  return textDecoder.decode(result);
}

/**
 * Encrypt plaintext with AES-256-GCM, returning raw bytes.
 * Returns Uint8Array([12-byte nonce][ciphertext][16-byte GCM tag]).
 * Use this for binary storage (e.g. ZIP files) to avoid base64/string
 * round-trips that can be corrupted by JSZip compression on Hermes.
 */
export async function aesGcmEncryptBytes(plaintext: string, key: Uint8Array): Promise<Uint8Array> {
  if (key.length !== 32) throw new Error(`Invalid AES key: expected 32 bytes, got ${key.length}`);
  const aesKey = await AESEncryptionKey.import(key);
  const sealed = await aesEncryptAsync(textEncoder.encode(plaintext), aesKey);
  const combined = await sealed.combined();
  await yieldThread();
  return combined;
}

/**
 * Decrypt raw bytes ([12-byte nonce][ciphertext][16-byte GCM tag]) with AES-256-GCM.
 * Counterpart to aesGcmEncryptBytes — operates on Uint8Array directly.
 */
export async function aesGcmDecryptBytes(data: Uint8Array, key: Uint8Array): Promise<string> {
  if (key.length !== 32) throw new Error(`Invalid AES key: expected 32 bytes, got ${key.length}`);
  if (data.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  await yieldThread();
  const sealed = AESSealedData.fromCombined(data);
  const aesKey = await AESEncryptionKey.import(key);
  const result = await aesDecryptAsync(sealed, aesKey);

  await yieldThread();
  return textDecoder.decode(result);
}

/**
 * Generate a cryptographically random salt.
 */
export function generateSalt(length: number = 16): Uint8Array {
  return getRandomBytes(length);
}

/**
 * Generate a cryptographically random UUID v4 (RFC 4122).
 */
export function generateUUID(): string {
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    // Padding chars ('=') map to 255 in lookup — treat as 0 for decoding
    const cChar = str.charCodeAt(i + 2);
    const dChar = str.charCodeAt(i + 3);
    const c = cChar === 61 /* '=' */ ? 0 : B64_LOOKUP[cChar];
    const d = dChar === 61 /* '=' */ ? 0 : B64_LOOKUP[dChar];
    // Detect invalid base64 characters (lookup returns 255 for unknown)
    if ((a | b | c | d) & 0x80) {
      throw new Error('Invalid base64 character in input');
    }
    out[j++] = (a << 2) | (b >> 4);
    if (j < outLen) out[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < outLen) out[j++] = ((c & 3) << 6) | d;
  }
  return out;
}
