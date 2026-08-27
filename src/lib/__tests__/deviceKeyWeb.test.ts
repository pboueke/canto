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

import {
  createDeviceEncryption,
  prepareKeyRotation,
  beginKeyRotation,
  abortKeyRotation,
  commitKeyRotation,
  recoverKeyRotation,
  _resetKeyCreationPromise,
} from '../encryption/device.web';

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

describe('Device key web — prepareKeyRotation / commitKeyRotation', () => {
  beforeEach(() => {
    localStorageMock.clear();
    _resetKeyCreationPromise();
  });

  it('returns old and new keys as 32-byte Uint8Arrays', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { oldKey, newKey } = await prepareKeyRotation();
    expect(oldKey).toBeInstanceOf(Uint8Array);
    expect(newKey).toBeInstanceOf(Uint8Array);
    expect(oldKey.length).toBe(32);
    expect(newKey.length).toBe(32);
  });

  it('prepareKeyRotation does NOT persist new key', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const before = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    await prepareKeyRotation();
    const after = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    expect(after).toBe(before);
  });

  it('commitKeyRotation persists new key in localStorage', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { newKey } = await prepareKeyRotation();
    await commitKeyRotation(newKey);
    const stored = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    expect(stored).toBe(bytesToHex(newKey));
  });

  it('retains the old protected key until the storage transaction commits', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    expect(localStorageMock.getItem(DEVICE_KEY_ALIAS)).toBe(bytesToHex(newKey));
    expect(localStorageMock.getItem(PREVIOUS_DEVICE_KEY_ALIAS)).toBe(bytesToHex(oldKey));

    await commitKeyRotation(newKey);
    expect(localStorageMock.getItem(PREVIOUS_DEVICE_KEY_ALIAS)).toBeNull();
  });

  it('restores the old key after an interrupted pre-commit rotation so retry can decrypt data', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('old-data');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    await abortKeyRotation();
    device.clearKey!();

    expect(await device.decrypt(ciphertext)).toBe('old-data');
    expect(localStorageMock.getItem(DEVICE_KEY_ALIAS)).toBe(bytesToHex(oldKey));
    expect(localStorageMock.getItem(PREVIOUS_DEVICE_KEY_ALIAS)).toBeNull();
  });

  it('restores the old key at startup after a crash before re-encryption, so retry preserves its fallback', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('old-data');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    // Startup sees no LocalStore completion marker, so this was a crash before
    // data re-encryption and must roll the current key back before retrying.
    await recoverKeyRotation(false);
    const retry = await prepareKeyRotation();
    expect(bytesToHex(retry.oldKey)).toBe(bytesToHex(oldKey));
    device.clearKey!();
    expect(await device.decrypt(ciphertext)).toBe('old-data');
    expect(localStorageMock.getItem(PREVIOUS_DEVICE_KEY_ALIAS)).toBeNull();
  });

  it('finalizes an interrupted rotation after startup proves the data commit', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    await recoverKeyRotation(true);

    expect(localStorageMock.getItem(DEVICE_KEY_ALIAS)).toBe(bytesToHex(newKey));
    expect(localStorageMock.getItem(PREVIOUS_DEVICE_KEY_ALIAS)).toBeNull();
  });

  it('old key matches what was previously in localStorage', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const before = localStorageMock.getItem(DEVICE_KEY_ALIAS);
    const { oldKey } = await prepareKeyRotation();
    expect(bytesToHex(oldKey)).toBe(before);
  });

  it('generates random oldKey when no existing key', async () => {
    const { oldKey, newKey } = await prepareKeyRotation();
    expect(oldKey.length).toBe(32);
    expect(newKey.length).toBe(32);
    expect(bytesToHex(oldKey)).not.toBe(bytesToHex(newKey));
  });

  it('new key differs from old key', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { oldKey, newKey } = await prepareKeyRotation();
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
    _resetKeyCreationPromise();
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

  it('uses the retained previous key to read ciphertext during a durable rotation', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('old committed data');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();
    await beginKeyRotation(oldKey, newKey);

    const rotatingDevice = createDeviceEncryption();
    await expect(rotatingDevice.decrypt(ciphertext)).resolves.toBe('old committed data');
  });

  it('does nothing when startup finds no pending key rotation', async () => {
    await expect(recoverKeyRotation(true)).resolves.toBeUndefined();
  });

  it('surfaces decryption failures when no previous rotation key exists', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    await expect(device.decrypt('not-valid-ciphertext')).rejects.toThrow();
  });

  it('resets keyCreationPromise on localStorage error so retry works', async () => {
    // Make localStorage.getItem throw once to trigger the .catch() branch (lines 46-47)
    const originalGetItem = localStorageMock.getItem;
    localStorageMock.getItem = () => {
      throw new Error('Storage unavailable');
    };

    const device = createDeviceEncryption();
    await expect(device.encrypt('test')).rejects.toThrow('Storage unavailable');

    // Restore and verify retry works (keyCreationPromise was reset by the catch)
    localStorageMock.getItem = originalGetItem;
    const device2 = createDeviceEncryption();
    const ct = await device2.encrypt('retry');
    const pt = await device2.decrypt(ct);
    expect(pt).toBe('retry');
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
