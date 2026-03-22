import { createDeviceEncryption } from './device';
import { createPasswordEncryption } from './password';
import { generateSalt } from './utils';
import type { EncryptionService } from './types';

export type { EncryptionService, EncryptionProvider, PasswordEncryptionProvider } from './types';

/**
 * Create the unified encryption service for Canto.
 *
 * Device encryption is always active (transparent).
 * Password encryption is layered on top for secure journals:
 *   plaintext → password encrypt → device encrypt → stored ciphertext
 */
export function createEncryptionService(): EncryptionService {
  const device = createDeviceEncryption();
  const password = createPasswordEncryption();

  return {
    encrypt(data: string): Promise<string> {
      return device.encrypt(data);
    },

    decrypt(ciphertext: string): Promise<string> {
      return device.decrypt(ciphertext);
    },

    async encryptWithPassword(data: string, pwd: string, salt: Uint8Array): Promise<string> {
      // Layer 1: password encryption
      const passwordEncrypted = await password.encrypt(data, pwd, salt);
      // Layer 2: device encryption on top
      return device.encrypt(passwordEncrypted);
    },

    async decryptWithPassword(ciphertext: string, pwd: string, salt: Uint8Array): Promise<string> {
      // Layer 1: device decryption
      const passwordEncrypted = await device.decrypt(ciphertext);
      // Layer 2: password decryption
      return password.decrypt(passwordEncrypted, pwd, salt);
    },

    generateSalt(): Uint8Array {
      return generateSalt(16);
    },

    clearSession(): void {
      device.clearKey?.();
    },
  };
}
