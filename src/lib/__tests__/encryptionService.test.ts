import { createEncryptionService } from '../encryption';

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
});
