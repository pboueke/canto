const mockCombined = jest.fn(async (encoding?: 'base64') => {
  if (encoding === 'base64') {
    throw new Error('The Web base64 encoder must not be used');
  }
  return new Uint8Array([1, 2, 3]);
});

jest.mock('expo-crypto', () => ({
  AESEncryptionKey: { import: jest.fn(async () => ({})) },
  AESSealedData: { fromCombined: jest.fn() },
  aesEncryptAsync: jest.fn(async () => ({ combined: mockCombined })),
  aesDecryptAsync: jest.fn(),
}));

import { aesGcmEncrypt } from '../utils';
import { AESEncryptionKey } from 'expo-crypto';

describe('Web AES-GCM output encoding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests raw sealed bytes instead of Expo Crypto base64 output', async () => {
    await expect(aesGcmEncrypt('payload', new Uint8Array(32))).resolves.toBe('AQID');
    expect(mockCombined).toHaveBeenCalledTimes(1);
    expect(mockCombined).toHaveBeenCalledWith();
  });

  it('imports a long-lived key once across repeated chunk operations', async () => {
    const key = new Uint8Array(32);

    await aesGcmEncrypt('first chunk', key);
    await aesGcmEncrypt('second chunk', key);

    expect(AESEncryptionKey.import).toHaveBeenCalledTimes(1);
  });
});
