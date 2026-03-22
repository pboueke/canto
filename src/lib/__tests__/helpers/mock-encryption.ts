/**
 * Deterministic mock encryption service for tests.
 * Actually transforms data (so round-trips can be verified) but is fast and predictable.
 */
import type { EncryptionService } from '@/lib/encryption';

const DEV_PREFIX = 'enc:';
const PWD_PREFIX = 'pwd:';

export function createMockEncryption(): EncryptionService {
  return {
    async encrypt(data: string): Promise<string> {
      return DEV_PREFIX + data;
    },
    async decrypt(ciphertext: string): Promise<string> {
      if (!ciphertext.startsWith(DEV_PREFIX)) {
        throw new Error('MockEncryption: invalid ciphertext (missing device prefix)');
      }
      return ciphertext.slice(DEV_PREFIX.length);
    },
    async encryptWithPassword(data: string, _password: string, _salt: Uint8Array): Promise<string> {
      return PWD_PREFIX + data;
    },
    async decryptWithPassword(
      ciphertext: string,
      _password: string,
      _salt: Uint8Array,
    ): Promise<string> {
      if (!ciphertext.startsWith(PWD_PREFIX)) {
        throw new Error('MockEncryption: invalid ciphertext (missing password prefix)');
      }
      return ciphertext.slice(PWD_PREFIX.length);
    },
    generateSalt(): Uint8Array {
      return new Uint8Array(16).fill(0xab);
    },
    clearSession(): void {
      // no-op
    },
  };
}
