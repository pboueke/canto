/**
 * Key-aware mock for `aesGcmEncrypt`/`aesGcmDecrypt`.
 *
 * Unlike the simple passthrough mocks used in most sync tests, these implementations
 * tag the ciphertext with the first 4 bytes of the key. Decryption verifies the tag
 * and throws on mismatch — matching real AES-GCM auth-tag failure behavior.
 *
 * Use this when a test needs to verify that wrong-key decryption fails (e.g.,
 * cross-device password change scenarios where one device's key cannot decrypt
 * data encrypted by another).
 *
 * Wire it up in a test file with:
 *
 *   jest.mock('../encryption/utils', () => ({
 *     ...jest.requireActual('../encryption/utils'),
 *     ...require('./helpers/key-aware-crypto').keyAwareCryptoMock(),
 *   }));
 */

const ENC_PREFIX = 'ENC';

export function keyTag(key: Uint8Array): string {
  return Array.from(key.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function keyAwareCryptoMock() {
  return {
    aesGcmEncrypt: jest.fn((plaintext: string, key: Uint8Array) => {
      const tag = keyTag(key);
      return Promise.resolve(
        `${ENC_PREFIX}:${tag}:` + btoa(unescape(encodeURIComponent(plaintext))),
      );
    }),
    aesGcmDecrypt: jest.fn((ciphertext: string, key: Uint8Array) => {
      const tag = keyTag(key);
      const expectedPrefix = `${ENC_PREFIX}:${tag}:`;
      if (!ciphertext.startsWith(expectedPrefix)) {
        return Promise.reject(new Error('Decryption failed: wrong key or corrupted data'));
      }
      return Promise.resolve(
        decodeURIComponent(escape(atob(ciphertext.slice(expectedPrefix.length)))),
      );
    }),
  };
}
