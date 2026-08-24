import {
  aesGcmEncrypt,
  aesGcmDecrypt,
  aesGcmEncryptBytes,
  aesGcmDecryptBytes,
  generateSalt,
  generateUUID,
  uint8ToBase64,
  base64ToUint8,
} from '../encryption/utils';
import { createPasswordEncryption } from '../encryption/password';

describe('AES-256-GCM encryption', () => {
  const key = new Uint8Array(32); // 256-bit zero key (test only)
  key.fill(0xab);

  it('encrypts and decrypts a string', async () => {
    const plaintext = 'Hello, Canto!';
    const ciphertext = await aesGcmEncrypt(plaintext, key);

    expect(ciphertext).not.toBe(plaintext);
    expect(typeof ciphertext).toBe('string');

    const decrypted = await aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (unique nonce)', async () => {
    const plaintext = 'Same input, different output';
    const c1 = await aesGcmEncrypt(plaintext, key);
    const c2 = await aesGcmEncrypt(plaintext, key);

    expect(c1).not.toBe(c2);

    // Both decrypt to the same value
    expect(await aesGcmDecrypt(c1, key)).toBe(plaintext);
    expect(await aesGcmDecrypt(c2, key)).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', async () => {
    const plaintext = 'Secret data';
    const ciphertext = await aesGcmEncrypt(plaintext, key);

    const wrongKey = new Uint8Array(32);
    wrongKey.fill(0xcd);

    await expect(aesGcmDecrypt(ciphertext, wrongKey)).rejects.toThrow();
  });

  it('fails on tampered ciphertext', async () => {
    const plaintext = 'Integrity check';
    const ciphertext = await aesGcmEncrypt(plaintext, key);

    // Tamper with a character in the middle
    const tampered =
      ciphertext.substring(0, 20) +
      String.fromCharCode(ciphertext.charCodeAt(20) ^ 1) +
      ciphertext.substring(21);

    await expect(aesGcmDecrypt(tampered, key)).rejects.toThrow();
  });

  it('rejects truncated ciphertext', async () => {
    await expect(aesGcmDecrypt('AAAA', key)).rejects.toThrow('too short');
  });

  it('handles empty string', async () => {
    const ciphertext = await aesGcmEncrypt('', key);
    const decrypted = await aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe('');
  });

  it('handles unicode text', async () => {
    const plaintext = 'Olá mundo! 🌍 日本語テスト';
    const ciphertext = await aesGcmEncrypt(plaintext, key);
    const decrypted = await aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });

  it('handles large text', async () => {
    const plaintext = 'x'.repeat(100_000);
    const ciphertext = await aesGcmEncrypt(plaintext, key);
    const decrypted = await aesGcmDecrypt(ciphertext, key);
    expect(decrypted).toBe(plaintext);
  });
});

describe('AES key length validation', () => {
  const shortKey = new Uint8Array(16);
  shortKey.fill(0xab);

  it('aesGcmEncrypt rejects non-32-byte key', async () => {
    await expect(aesGcmEncrypt('test', shortKey)).rejects.toThrow('expected 32 bytes');
  });

  it('aesGcmDecrypt rejects non-32-byte key', async () => {
    await expect(aesGcmDecrypt('AAAA', shortKey)).rejects.toThrow('expected 32 bytes');
  });

  it('aesGcmEncryptBytes rejects non-32-byte key', async () => {
    await expect(aesGcmEncryptBytes('test', shortKey)).rejects.toThrow('expected 32 bytes');
  });

  it('aesGcmDecryptBytes rejects non-32-byte key', async () => {
    await expect(aesGcmDecryptBytes(new Uint8Array(100), shortKey)).rejects.toThrow(
      'expected 32 bytes',
    );
  });
});

describe('aesGcmEncryptBytes / aesGcmDecryptBytes', () => {
  const key = new Uint8Array(32);
  key.fill(0xab);

  it('encrypts and decrypts round-trip', async () => {
    const plaintext = 'Hello bytes!';
    const encrypted = await aesGcmEncryptBytes(plaintext, key);
    expect(encrypted).toBeInstanceOf(Uint8Array);
    const decrypted = await aesGcmDecryptBytes(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('rejects too-short ciphertext', async () => {
    const tooShort = new Uint8Array(10); // less than NONCE_LENGTH + TAG_LENGTH (28)
    await expect(aesGcmDecryptBytes(tooShort, key)).rejects.toThrow('too short');
  });
});

describe('base64 round-trip', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = uint8ToBase64(bytes);
    const result = base64ToUint8(b64);
    expect(result).toEqual(bytes);
  });

  it('strips whitespace and BOM from base64 input', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const b64 = uint8ToBase64(bytes);
    // Insert whitespace and non-base64 chars
    const dirty = `  ${b64}  \n`;
    const result = base64ToUint8(dirty);
    expect(result).toEqual(bytes);
  });

  it('encodes a sync-sized chunk with standard base64 output', () => {
    const bytes = new Uint8Array(512 * 1024);
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;

    expect(uint8ToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('generateUUID', () => {
  it('returns a valid UUID v4 format', () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns different values on each call', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).not.toBe(uuid2);
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
