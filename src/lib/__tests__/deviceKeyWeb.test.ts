/**
 * Tests for the web (localStorage-backed) device key implementation.
 * Mirrors deviceKey.test.ts which tests the native (expo-secure-store) version.
 */

// Provide a localStorage mock for the Node test environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Suppress the console.warn from device.web.ts module-level code
Object.defineProperty(globalThis, 'window', { value: undefined, writable: true });

import { createDeviceEncryption, rotateKey } from '../encryption/device.web';

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

describe('Device key web — rotateKey', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns old and new keys as 32-byte Uint8Arrays', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { oldKey, newKey } = await rotateKey();
    expect(oldKey).toBeInstanceOf(Uint8Array);
    expect(newKey).toBeInstanceOf(Uint8Array);
    expect(oldKey.length).toBe(32);
    expect(newKey.length).toBe(32);
  });

  it('stores new key in localStorage', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { newKey } = await rotateKey();
    const stored = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    expect(stored).toBe(bytesToHex(newKey));
  });

  it('old key matches what was previously in localStorage', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const before = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    const { oldKey } = await rotateKey();
    expect(bytesToHex(oldKey)).toBe(before);
  });

  it('generates random oldKey when no existing key', async () => {
    const { oldKey, newKey } = await rotateKey();
    expect(oldKey.length).toBe(32);
    expect(newKey.length).toBe(32);
    expect(bytesToHex(oldKey)).not.toBe(bytesToHex(newKey));
  });

  it('new key differs from old key', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { oldKey, newKey } = await rotateKey();
    expect(bytesToHex(oldKey)).not.toBe(bytesToHex(newKey));
  });
});

describe('hex encoding round-trip (web)', () => {
  it('bytesToHex(hexToBytes(x)) === x', () => {
    const hex = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    expect(bytesToHex(hexToBytes(hex))).toBe(hex);
  });

  it('works for a random 32-byte key', () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = bytesToHex(bytes);
    const roundTripped = hexToBytes(hex);
    expect(Buffer.from(roundTripped)).toEqual(Buffer.from(bytes));
  });
});

describe('createDeviceEncryption web — key lifecycle', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('first call creates key in localStorage', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('test');
    const stored = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    expect(stored).toBeTruthy();
    expect(stored!.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('clearKey then encrypt re-reads from localStorage', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('test');
    device.clearKey!();
    const decrypted = await device.decrypt(ciphertext);
    expect(decrypted).toBe('test');
  });

  it('encrypt and decrypt round-trip', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('hello world');
    const decrypted = await device.decrypt(ciphertext);
    expect(decrypted).toBe('hello world');
  });

  it('different encrypt calls produce different ciphertexts (unique nonce)', async () => {
    const device = createDeviceEncryption();
    const ct1 = await device.encrypt('same text');
    const ct2 = await device.encrypt('same text');
    expect(ct1).not.toBe(ct2);
  });
});
