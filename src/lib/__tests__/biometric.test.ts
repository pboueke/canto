/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  isBiometricAvailable,
  authenticateBiometric,
  storeBiometricKey,
  getBiometricKey,
  clearBiometricKey,
} from '../biometric';

// Uses global mocks from jest.setup.ts for expo-secure-store and expo-local-authentication

describe('isBiometricAvailable', () => {
  beforeEach(() => {
    (globalThis as any).__setBiometricHardware(true);
    (globalThis as any).__setBiometricEnrolled(true);
  });

  it('returns true when hardware and enrollment present', async () => {
    expect(await isBiometricAvailable()).toBe(true);
  });

  it('returns false when no hardware', async () => {
    (globalThis as any).__setBiometricHardware(false);
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('returns false when hardware present but not enrolled', async () => {
    (globalThis as any).__setBiometricEnrolled(false);
    expect(await isBiometricAvailable()).toBe(false);
  });
});

describe('authenticateBiometric', () => {
  beforeEach(() => {
    (globalThis as any).__setBiometricAuthResult(true);
  });

  it('returns true on success', async () => {
    expect(await authenticateBiometric('Unlock journal')).toBe(true);
  });

  it('returns false on failure', async () => {
    (globalThis as any).__setBiometricAuthResult(false);
    expect(await authenticateBiometric('Unlock journal')).toBe(false);
  });
});

describe('biometric key storage', () => {
  beforeEach(() => {
    (globalThis as any).__secureStoreClear();
    (globalThis as any).__secureStoreSetRequireAuthFail(false);
  });

  it('store then get returns same key', async () => {
    const key = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32,
    ]);
    await storeBiometricKey('journal-1', key);
    const retrieved = await getBiometricKey('journal-1');
    expect(retrieved).not.toBeNull();
    expect(Buffer.from(retrieved!).toString('hex')).toBe(Buffer.from(key).toString('hex'));
  });

  it('get returns null when no key stored', async () => {
    expect(await getBiometricKey('nonexistent')).toBeNull();
  });

  it('clear removes key', async () => {
    const key = new Uint8Array(32).fill(42);
    await storeBiometricKey('journal-2', key);
    expect(await getBiometricKey('journal-2')).not.toBeNull();

    await clearBiometricKey('journal-2');
    expect(await getBiometricKey('journal-2')).toBeNull();
  });

  it('silently succeeds when requireAuthentication fails on store', async () => {
    (globalThis as any).__secureStoreSetRequireAuthFail(true);
    const key = new Uint8Array(32).fill(99);
    // Should not throw
    await expect(storeBiometricKey('journal-3', key)).resolves.toBeUndefined();
  });

  it('returns null when auth fails on get', async () => {
    const key = new Uint8Array(32).fill(77);
    await storeBiometricKey('journal-4', key);

    (globalThis as any).__secureStoreSetRequireAuthFail(true);
    expect(await getBiometricKey('journal-4')).toBeNull();
  });

  it('uses different SecureStore keys for different journalIds', async () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);
    await storeBiometricKey('j-a', key1);
    await storeBiometricKey('j-b', key2);

    const retrieved1 = await getBiometricKey('j-a');
    const retrieved2 = await getBiometricKey('j-b');
    expect(Buffer.from(retrieved1!).toString('hex')).not.toBe(
      Buffer.from(retrieved2!).toString('hex'),
    );
  });
});
