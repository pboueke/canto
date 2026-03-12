import { aesGcmEncrypt, aesGcmDecrypt, generateSalt } from '../encryption/utils';
import { createPasswordEncryption } from '../encryption/password';

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  getRandomBytes: (length: number) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  },
}));

describe('AES-256-GCM encryption', () => {
  const key = new Uint8Array(32); // 256-bit zero key (test only)
  key.fill(0xab);

  it('encrypts and decrypts a string', () => {
    const plaintext = 'Hello, Canto!';
    const ciphertext = aesGcmEncrypt(plaintext, key);

    expect(ciphertext).not.toBe(plaintext);
    expect(typeof ciphertext).toBe('string');

    const decrypted = aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (unique nonce)', () => {
    const plaintext = 'Same input, different output';
    const c1 = aesGcmEncrypt(plaintext, key);
    const c2 = aesGcmEncrypt(plaintext, key);

    expect(c1).not.toBe(c2);

    // Both decrypt to the same value
    expect(aesGcmDecrypt(c1, key)).toBe(plaintext);
    expect(aesGcmDecrypt(c2, key)).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', () => {
    const plaintext = 'Secret data';
    const ciphertext = aesGcmEncrypt(plaintext, key);

    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    expect(() => aesGcmDecrypt(ciphertext, wrongKey)).toThrow();
  });

  it('fails on tampered ciphertext', () => {
    const plaintext = 'Integrity check';
    const ciphertext = aesGcmEncrypt(plaintext, key);

    // Tamper with a character in the middle
    const tampered =
      ciphertext.substring(0, 20) +
      String.fromCharCode(ciphertext.charCodeAt(20) ^ 1) +
      ciphertext.substring(21);

    expect(() => aesGcmDecrypt(tampered, key)).toThrow();
  });

  it('rejects truncated ciphertext', () => {
    expect(() => aesGcmDecrypt('AAAA', key)).toThrow('too short');
  });

  it('handles empty string', () => {
    const ciphertext = aesGcmEncrypt('', key);
    const decrypted = aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe('');
  });

  it('handles unicode text', () => {
    const plaintext = 'Olá mundo! 🌍 日本語テスト';
    const ciphertext = aesGcmEncrypt(plaintext, key);
    const decrypted = aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('handles large text', () => {
    const plaintext = 'x'.repeat(100_000);
    const ciphertext = aesGcmEncrypt(plaintext, key);
    const decrypted = aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });
});

describe('generateSalt', () => {
  it('returns bytes of requested length', () => {
    const salt = generateSalt(16);
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('returns different values each time', () => {
    const s1 = generateSalt(16);
    const s2 = generateSalt(16);
    expect(s1).not.toEqual(s2);
  });
});

describe('Password encryption (PBKDF2 + AES-256-GCM)', () => {
  const provider = createPasswordEncryption();
  const salt = new Uint8Array(16);
  salt.fill(0x42);

  it('encrypts and decrypts with correct password', async () => {
    const plaintext = 'My secret journal entry';
    const password = 'strongP@ssw0rd!';

    const ciphertext = await provider.encrypt(plaintext, password, salt);
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await provider.decrypt(ciphertext, password, salt);
    expect(decrypted).toBe(plaintext);
  });

  it('fails with wrong password', async () => {
    const plaintext = 'Protected data';
    const ciphertext = await provider.encrypt(plaintext, 'correct', salt);

    await expect(provider.decrypt(ciphertext, 'wrong', salt)).rejects.toThrow();
  });

  it('fails with wrong salt', async () => {
    const plaintext = 'Protected data';
    const ciphertext = await provider.encrypt(plaintext, 'password', salt);

    const wrongSalt = new Uint8Array(16);
    wrongSalt.fill(0x99);

    await expect(provider.decrypt(ciphertext, 'password', wrongSalt)).rejects.toThrow();
  });
});
