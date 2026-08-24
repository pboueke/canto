/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createDeviceEncryption,
  prepareKeyRotation,
  beginKeyRotation,
  abortKeyRotation,
  commitKeyRotation,
  finalizeCompletedKeyRotation,
  recoverKeyRotation,
  _resetKeyCreationPromise,
} from '../encryption/device';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import * as SecureStore from 'expo-secure-store';

// Uses global mock from jest.setup.ts

describe('Device key — prepareKeyRotation / commitKeyRotation', () => {
  beforeEach(() => {
    (globalThis as any).__secureStoreClear();
    _resetKeyCreationPromise();
  });

  it('returns old and new keys as 32-byte Uint8Arrays', async () => {
    // Seed a key
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

    const before = await SecureStore.getItemAsync('canto_device_encryption_key');
    await prepareKeyRotation();
    const after = await SecureStore.getItemAsync('canto_device_encryption_key');
    expect(after).toBe(before);
  });

  it('commitKeyRotation persists new key in SecureStore', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const { newKey } = await prepareKeyRotation();
    await commitKeyRotation(newKey);
    const stored = await SecureStore.getItemAsync('canto_device_encryption_key');
    expect(stored).toBe(bytesToHex(newKey));
  });

  it('retains the old key until the storage transaction commits', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    expect(await SecureStore.getItemAsync('canto_device_encryption_key')).toBe(bytesToHex(newKey));
    expect(await SecureStore.getItemAsync('canto_device_encryption_previous_key')).toBe(
      bytesToHex(oldKey),
    );

    await commitKeyRotation(newKey);
    expect(await SecureStore.getItemAsync('canto_device_encryption_previous_key')).toBeNull();
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
    expect(await SecureStore.getItemAsync('canto_device_encryption_key')).toBe(bytesToHex(oldKey));
    expect(await SecureStore.getItemAsync('canto_device_encryption_previous_key')).toBeNull();
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
    expect(await SecureStore.getItemAsync('canto_device_encryption_previous_key')).toBeNull();
  });

  it('finalizes an interrupted rotation after startup proves the data commit', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();
    const { oldKey, newKey } = await prepareKeyRotation();

    await beginKeyRotation(oldKey, newKey);
    await finalizeCompletedKeyRotation();

    expect(await SecureStore.getItemAsync('canto_device_encryption_key')).toBe(bytesToHex(newKey));
    expect(await SecureStore.getItemAsync('canto_device_encryption_previous_key')).toBeNull();
  });

  it('old key matches what was previously in SecureStore', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('seed');
    device.clearKey!();

    const before = await SecureStore.getItemAsync('canto_device_encryption_key');
    const { oldKey } = await prepareKeyRotation();
    expect(bytesToHex(oldKey)).toBe(before);
  });

  it('generates random oldKey when no existing key', async () => {
    const { oldKey, newKey } = await prepareKeyRotation();
    expect(oldKey.length).toBe(32);
    expect(newKey.length).toBe(32);
    // They should be different (random)
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

describe('hex encoding round-trip', () => {
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

describe('createDeviceEncryption — key lifecycle', () => {
  beforeEach(() => {
    (globalThis as any).__secureStoreClear();
    _resetKeyCreationPromise();
  });

  it('first call creates key in SecureStore', async () => {
    const device = createDeviceEncryption();
    await device.encrypt('test');
    const stored = await SecureStore.getItemAsync('canto_device_encryption_key');
    expect(stored).toBeTruthy();
    expect(stored!.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it('clearKey then encrypt re-reads from SecureStore', async () => {
    const device = createDeviceEncryption();
    const ciphertext = await device.encrypt('test');
    device.clearKey!();
    // Should still be able to decrypt after clearing cache (re-reads stored key)
    const decrypted = await device.decrypt(ciphertext);
    expect(decrypted).toBe('test');
  });

  it('resets keyCreationPromise on SecureStore error so retry works', async () => {
    // Make SecureStore.getItemAsync throw once to trigger the .catch() branch
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('Keychain unavailable'),
    );

    const device = createDeviceEncryption();
    await expect(device.encrypt('test')).rejects.toThrow('Keychain unavailable');

    // After the error, keyCreationPromise should have been reset (null) by the catch,
    // so a subsequent call should succeed (it re-enters getOrCreateDeviceKey)
    const device2 = createDeviceEncryption();
    const ct = await device2.encrypt('retry');
    const pt = await device2.decrypt(ct);
    expect(pt).toBe('retry');
  });
});
