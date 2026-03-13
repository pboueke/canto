import {
  deriveKey,
  LEGACY_KDF_ITERATIONS,
  DEFAULT_KDF_ITERATIONS,
  KDF_PRESETS,
  createPasswordEncryption,
} from '../encryption/password';
import { generateSalt } from '../encryption/utils';

describe('deriveKey', () => {
  const salt = generateSalt(16);

  it('produces deterministic output for same inputs', async () => {
    const k1 = await deriveKey('password', salt, 1000);
    const k2 = await deriveKey('password', salt, 1000);
    expect(Buffer.from(k1).toString('hex')).toBe(Buffer.from(k2).toString('hex'));
  });

  it('produces different output for different salts', async () => {
    const salt2 = generateSalt(16);
    const k1 = await deriveKey('password', salt, 1000);
    const k2 = await deriveKey('password', salt2, 1000);
    expect(Buffer.from(k1).toString('hex')).not.toBe(Buffer.from(k2).toString('hex'));
  });

  it('produces different output for different iterations', async () => {
    const k1 = await deriveKey('password', salt, 1000);
    const k2 = await deriveKey('password', salt, 2000);
    expect(Buffer.from(k1).toString('hex')).not.toBe(Buffer.from(k2).toString('hex'));
  });

  it('always returns 32 bytes', async () => {
    const key = await deriveKey('test', salt, 1000);
    expect(key.length).toBe(32);
    expect(key).toBeInstanceOf(Uint8Array);
  });

  it('LEGACY_KDF_ITERATIONS equals 20_000', () => {
    expect(LEGACY_KDF_ITERATIONS).toBe(20_000);
  });

  it('DEFAULT_KDF_ITERATIONS equals 50_000', () => {
    expect(DEFAULT_KDF_ITERATIONS).toBe(50_000);
  });

  it('KDF_PRESETS contains 6 entries with correct values', () => {
    expect(KDF_PRESETS).toHaveLength(6);
    expect(KDF_PRESETS.map((p) => p.value)).toEqual([
      50_000, 100_000, 200_000, 600_000, 800_000, 1_000_000,
    ]);
    expect(KDF_PRESETS.map((p) => p.label)).toEqual([
      'fast',
      'improved',
      'moderate',
      'strong',
      'great',
      'extreme',
    ]);
  });
});

describe('createPasswordEncryption', () => {
  const salt = generateSalt(16);

  it('encrypt then decrypt returns original plaintext', async () => {
    const enc = createPasswordEncryption();
    const plaintext = 'Hello, World!';
    const ciphertext = await enc.encrypt(plaintext, 'mypassword', salt);
    const decrypted = await enc.decrypt(ciphertext, 'mypassword', salt);
    expect(decrypted).toBe(plaintext);
  });

  it('different passwords produce different ciphertext', async () => {
    const enc = createPasswordEncryption();
    const plaintext = 'same text';
    const c1 = await enc.encrypt(plaintext, 'password1', salt);
    const c2 = await enc.encrypt(plaintext, 'password2', salt);
    expect(c1).not.toBe(c2);
  });

  it('different salts produce different ciphertext', async () => {
    const enc = createPasswordEncryption();
    const salt2 = generateSalt(16);
    const plaintext = 'same text';
    const c1 = await enc.encrypt(plaintext, 'password', salt);
    const c2 = await enc.encrypt(plaintext, 'password', salt2);
    expect(c1).not.toBe(c2);
  });
});
