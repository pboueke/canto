/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createDeviceEncryption,
  prepareKeyRotation,
  commitKeyRotation,
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
});
