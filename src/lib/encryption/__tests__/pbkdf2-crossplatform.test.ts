/**
 * Cross-platform PBKDF2 consistency tests.
 *
 * These tests verify:
 * 1. deriveKey produces RFC 2898 reference vectors (computed via Node.js crypto)
 * 2. An encrypt→decrypt roundtrip works with deriveKey output
 * 3. The cloud import flow (encrypt on one device, decrypt on another) works
 *
 * Reference values: Node.js crypto.pbkdf2Sync (OpenSSL, canonical RFC 2898).
 */
import { deriveKey, createPasswordEncryption } from '../password';
import { aesGcmEncrypt, aesGcmDecrypt, base64ToUint8 } from '../utils';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Reference vectors computed with:
//   node -e "const c=require('crypto'); console.log(c.pbkdf2Sync(pw,salt,iters,32,'sha256').toString('hex'))"
const VECTORS = [
  {
    name: 'empty password, 16-byte salt, 50k iterations',
    password: '',
    salt: 'def7ba2051e8bd85701593a776e2d6bc',
    iterations: 50_000,
    expected: '48ad047c712c101acf102e7af250b438ea76209085eb8a0627383133d9d31055',
  },
  {
    name: '"password", 8-byte salt, 1k iterations',
    password: 'password',
    salt: '73616c7431323334', // "salt1234"
    iterations: 1_000,
    expected: '181307ef2345dc21f6cba6947ff8c2a95d4da7a8d6af39816169fb804425b8f5',
  },
  {
    name: 'empty password, 2-byte salt, 1 iteration',
    password: '',
    salt: 'dead',
    iterations: 1,
    expected: 'b2043c59ebaaa44dc36b3c2f13b1ef672e75a2ac3c9a01a7d55260c3d250b6ed',
  },
];

describe('deriveKey: RFC 2898 reference vectors', () => {
  for (const v of VECTORS) {
    it(v.name, async () => {
      const salt = new Uint8Array(v.salt.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
      const key = await deriveKey(v.password, salt, v.iterations);
      expect(toHex(key)).toBe(v.expected);
    });
  }
});

describe('deriveKey: base64 salt roundtrip (simulates cloud import)', () => {
  it('decodes base64 salt and derives the same key', async () => {
    const saltBase64 = '3ve6IFHovYVwFZOnduLWvA==';
    const salt = base64ToUint8(saltBase64);
    const key = await deriveKey('', salt, 50_000);
    expect(toHex(key)).toBe(VECTORS[0].expected);
  });
});

describe('encrypt→decrypt roundtrip with derived key', () => {
  it('data encrypted with deriveKey output can be decrypted with same key', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const key = await deriveKey('test-password', salt, 1_000);

    const plaintext = JSON.stringify({ title: 'My Journal', icon: 'book' });
    const ciphertext = await aesGcmEncrypt(plaintext, key);

    // Re-derive the same key (simulates the import side)
    const key2 = await deriveKey('test-password', salt, 1_000);
    const decrypted = await aesGcmDecrypt(ciphertext, key2);

    expect(decrypted).toBe(plaintext);
  });

  it('fails with wrong password', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const key = await deriveKey('correct', salt, 1_000);
    const ciphertext = await aesGcmEncrypt('secret data', key);

    const wrongKey = await deriveKey('wrong', salt, 1_000);
    await expect(aesGcmDecrypt(ciphertext, wrongKey)).rejects.toThrow();
  });

  it('fails with wrong iterations', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const key = await deriveKey('pass', salt, 1_000);
    const ciphertext = await aesGcmEncrypt('secret data', key);

    const wrongKey = await deriveKey('pass', salt, 2_000);
    await expect(aesGcmDecrypt(ciphertext, wrongKey)).rejects.toThrow();
  });
});

describe('createPasswordEncryption roundtrip', () => {
  it('encrypt then decrypt returns original plaintext', async () => {
    const enc = createPasswordEncryption(1_000);
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const plaintext = 'Hello, encrypted world!';

    const ciphertext = await enc.encrypt(plaintext, 'pw', salt);
    const decrypted = await enc.decrypt(ciphertext, 'pw', salt);

    expect(decrypted).toBe(plaintext);
  });
});

describe('cloud import simulation (sync engine → cloud import)', () => {
  // Simulates: Android sync encrypts journal meta, web cloud import decrypts it.
  // Both sides must derive the same key from the same (password, salt, iterations).

  it('non-password journal: encrypt with empty pw, decrypt with empty pw', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const iterations = 50_000;

    // Sync engine side: derive key and encrypt
    const syncKey = await deriveKey('', salt, iterations);
    const meta = JSON.stringify({ id: 'j1', title: 'Test', icon: 'book' });
    const encrypted = await aesGcmEncrypt(meta, syncKey);

    // Cloud import side: derive key with same params and decrypt
    const importKey = await deriveKey('', salt, iterations);
    const decrypted = await aesGcmDecrypt(encrypted, importKey);

    expect(decrypted).toBe(meta);
  });

  it('password journal: encrypt with password, decrypt with same password', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const iterations = 50_000;
    const password = 'my-secret';

    // Sync engine side: key derived from actual password
    const syncKey = await deriveKey(password, salt, iterations);
    const meta = JSON.stringify({ id: 'j2', title: 'Secret', icon: 'lock', secure: true });
    const encrypted = await aesGcmEncrypt(meta, syncKey);

    // Cloud import side: user provides the same password
    const importKey = await deriveKey(password, salt, iterations);
    const decrypted = await aesGcmDecrypt(encrypted, importKey);

    expect(decrypted).toBe(meta);
  });

  it('password journal: decrypt with empty password fails', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const iterations = 50_000;

    // Encrypted with a real password
    const syncKey = await deriveKey('real-password', salt, iterations);
    const encrypted = await aesGcmEncrypt('secret data', syncKey);

    // Cloud import tries empty password — must fail
    const wrongKey = await deriveKey('', salt, iterations);
    await expect(aesGcmDecrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  it('password journal: decrypt with wrong password fails', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const iterations = 50_000;

    const syncKey = await deriveKey('correct-password', salt, iterations);
    const encrypted = await aesGcmEncrypt('secret data', syncKey);

    const wrongKey = await deriveKey('wrong-password', salt, iterations);
    await expect(aesGcmDecrypt(encrypted, wrongKey)).rejects.toThrow();
  });

  it('different kdfIterations produce different keys', async () => {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);

    const key1 = await deriveKey('', salt, 50_000);
    const key2 = await deriveKey('', salt, 100_000);

    expect(toHex(key1)).not.toBe(toHex(key2));
  });
});
