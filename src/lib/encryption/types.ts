/**
 * Core encryption interfaces for Canto's two-tier encryption system.
 *
 * Tier 1 (Device): Transparent encryption using a device-stored key.
 * Tier 2 (Password): User-provided password + salt for secure journals.
 *
 * All implementations MUST use AES-256-GCM with unique 12-byte nonces.
 * Ciphertext format: base64([12-byte nonce][ciphertext][16-byte GCM tag])
 */

export interface EncryptionProvider {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export interface PasswordEncryptionProvider {
  encrypt(plaintext: string, password: string, salt: Uint8Array): Promise<string>;
  decrypt(ciphertext: string, password: string, salt: Uint8Array): Promise<string>;
}

export interface EncryptionService {
  /** Encrypt data using device-level encryption only */
  encrypt(data: string): Promise<string>;
  /** Decrypt data using device-level encryption only */
  decrypt(ciphertext: string): Promise<string>;
  /** Encrypt data with password encryption layered on top of device encryption */
  encryptWithPassword(data: string, password: string, salt: Uint8Array): Promise<string>;
  /** Decrypt data with password decryption layered under device decryption */
  decryptWithPassword(ciphertext: string, password: string, salt: Uint8Array): Promise<string>;
  /** Generate a cryptographically random salt */
  generateSalt(): Uint8Array;
}
