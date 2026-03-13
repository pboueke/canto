import { createDeviceEncryption } from '../encryption/device';

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
  };
});

describe('Device Encryption', () => {
  it('encrypts and decrypts a string round-trip', async () => {
    const device = createDeviceEncryption();
    const plaintext = 'Hello device encryption!';
    const ciphertext = await device.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    const decrypted = await device.decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for same input (unique nonce)', async () => {
    const device = createDeviceEncryption();
    const plaintext = 'Same text twice';
    const c1 = await device.encrypt(plaintext);
    const c2 = await device.encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('caches the key across encrypt calls', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockClear();
    SecureStore.setItemAsync.mockClear();

    const device = createDeviceEncryption();
    await device.encrypt('first');
    await device.encrypt('second');

    // Key should be fetched/created only once due to caching
    expect(SecureStore.getItemAsync.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('clearKey zeros and nullifies the cached key', async () => {
    const device = createDeviceEncryption();
    // Warm up the cache
    const ciphertext = await device.encrypt('before clear');

    // Clear the key
    device.clearKey!();

    // Should still be able to decrypt (key re-fetched from SecureStore)
    const decrypted = await device.decrypt(ciphertext);
    expect(decrypted).toBe('before clear');
  });

  it('handles unicode and empty strings', async () => {
    const device = createDeviceEncryption();

    const empty = await device.encrypt('');
    expect(await device.decrypt(empty)).toBe('');

    const unicode = 'Olá 🌍 日本語';
    const enc = await device.encrypt(unicode);
    expect(await device.decrypt(enc)).toBe(unicode);
  });
});
