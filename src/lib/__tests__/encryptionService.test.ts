import { createEncryptionService } from '../encryption';
import { _resetKeyCreationPromise } from '../encryption/device';

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    __clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
});

afterEach(() => {
  require('expo-secure-store').__clear();
  _resetKeyCreationPromise();
});

describe('EncryptionService', () => {
  it('encrypts and decrypts with device-only encryption', async () => {
    const service = createEncryptionService();
    const plaintext = 'Device-only data';
    const ciphertext = await service.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    const decrypted = await service.decrypt(ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts with password layer', async () => {
    const service = createEncryptionService();
    const salt = service.generateSalt();
    const plaintext = 'Password-protected entry';
    const password = 'myStr0ngP@ss!';

    const ciphertext = await service.encryptWithPassword(plaintext, password, salt);
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = await service.decryptWithPassword(ciphertext, password, salt);
    expect(decrypted).toBe(plaintext);
  });

  it('fails to decrypt password-encrypted data with wrong password', async () => {
    const service = createEncryptionService();
    const salt = service.generateSalt();
    const ciphertext = await service.encryptWithPassword('secret', 'correct', salt);

    await expect(service.decryptWithPassword(ciphertext, 'wrong', salt)).rejects.toThrow();
  });

  it('generateSalt returns 16-byte Uint8Array', () => {
    const service = createEncryptionService();
    const salt = service.generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('generateSalt returns unique values', () => {
    const service = createEncryptionService();
    const s1 = service.generateSalt();
    const s2 = service.generateSalt();
    expect(s1).not.toEqual(s2);
  });

  it('clearSession does not throw', () => {
    const service = createEncryptionService();
    expect(() => service.clearSession()).not.toThrow();
  });

  describe('layered encryption (device + password)', () => {
    it('device-decrypting password-encrypted data yields intermediate ciphertext, not plaintext', async () => {
      const service = createEncryptionService();
      const salt = service.generateSalt();
      const plaintext = 'layered secret';

      const ciphertext = await service.encryptWithPassword(plaintext, 'pass', salt);

      // Device-only decrypt should yield the password-encrypted intermediate
      const intermediate = await service.decrypt(ciphertext);
      expect(intermediate).not.toBe(plaintext);
      expect(intermediate).not.toBe(ciphertext);
    });

    it('password layer can be verified independently from device layer', async () => {
      const service = createEncryptionService();
      const salt = service.generateSalt();
      const plaintext = 'verify layers';

      const ciphertext = await service.encryptWithPassword(plaintext, 'pass', salt);

      // Strip device layer only
      const passwordEncrypted = await service.decrypt(ciphertext);

      // The password-encrypted content should be non-empty and different from both
      expect(passwordEncrypted.length).toBeGreaterThan(0);
      expect(passwordEncrypted).not.toBe(plaintext);
      expect(passwordEncrypted).not.toBe(ciphertext);

      // Full round-trip through both layers confirms layering works
      const decrypted = await service.decryptWithPassword(ciphertext, 'pass', salt);
      expect(decrypted).toBe(plaintext);
    });

    it('different salts produce different ciphertexts for same password+plaintext', async () => {
      const service = createEncryptionService();
      const salt1 = service.generateSalt();
      const salt2 = service.generateSalt();

      const ct1 = await service.encryptWithPassword('same data', 'same pass', salt1);
      const ct2 = await service.encryptWithPassword('same data', 'same pass', salt2);

      expect(ct1).not.toBe(ct2);
    });

    it('wrong salt fails to decrypt', async () => {
      const service = createEncryptionService();
      const salt = service.generateSalt();
      const wrongSalt = service.generateSalt();

      const ct = await service.encryptWithPassword('secret', 'pass', salt);
      await expect(service.decryptWithPassword(ct, 'pass', wrongSalt)).rejects.toThrow();
    });
  });

  describe('clearSession behavior', () => {
    it('encrypt still works after clearSession (re-reads key from store)', async () => {
      const service = createEncryptionService();

      // First encrypt to ensure device key is created
      const ct1 = await service.encrypt('data1');
      service.clearSession();

      // Should still work — re-reads key from SecureStore
      const ct2 = await service.encrypt('data2');
      expect(ct2).not.toBe(ct1);

      // Both should decrypt correctly
      expect(await service.decrypt(ct1)).toBe('data1');
      expect(await service.decrypt(ct2)).toBe('data2');
    });

    it('password encryption works after clearSession', async () => {
      const service = createEncryptionService();
      const salt = service.generateSalt();

      const ct = await service.encryptWithPassword('secret', 'pass', salt);
      service.clearSession();

      const decrypted = await service.decryptWithPassword(ct, 'pass', salt);
      expect(decrypted).toBe('secret');
    });
  });
});
