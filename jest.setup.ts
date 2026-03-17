/* eslint-disable @typescript-eslint/no-explicit-any */
// Mock globals needed by Expo SDK 55 runtime before it loads
// Prevents "import outside of test scope" errors in Jest 30

Object.defineProperty(globalThis, '__ExpoImportMetaRegistry', {
  value: {},
  writable: true,
  configurable: true,
});

if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
}

// ---------------------------------------------------------------------------
// Mock: AsyncStorage
// ---------------------------------------------------------------------------
const mockAsyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockAsyncStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockAsyncStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockAsyncStore[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      for (const k of Object.keys(mockAsyncStore)) delete mockAsyncStore[k];
      return Promise.resolve();
    }),
  },
}));

// Export helper so tests can reset state between runs
(globalThis as any).__asyncStoreClear = () => {
  for (const k of Object.keys(mockAsyncStore)) delete mockAsyncStore[k];
};

// ---------------------------------------------------------------------------
// Mock: expo-secure-store
// ---------------------------------------------------------------------------
const mockSecureStoreData: Record<string, string> = {};
let mockSecureStoreRequireAuthFail = false;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string, opts?: { requireAuthentication?: boolean }) => {
    if (opts?.requireAuthentication && mockSecureStoreRequireAuthFail) {
      throw new Error('Biometric authentication failed');
    }
    return mockSecureStoreData[key] ?? null;
  }),
  setItemAsync: jest.fn(
    async (key: string, value: string, opts?: { requireAuthentication?: boolean }) => {
      if (opts?.requireAuthentication && mockSecureStoreRequireAuthFail) {
        throw new Error('Biometric authentication failed');
      }
      mockSecureStoreData[key] = value;
    },
  ),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStoreData[key];
  }),
}));

(globalThis as any).__secureStoreClear = () => {
  for (const k of Object.keys(mockSecureStoreData)) delete mockSecureStoreData[k];
};
(globalThis as any).__secureStoreSetRequireAuthFail = (fail: boolean) => {
  mockSecureStoreRequireAuthFail = fail;
};

// ---------------------------------------------------------------------------
// Mock: expo-crypto (AES-GCM via @noble/ciphers for Jest/Node)
// ---------------------------------------------------------------------------
jest.mock('expo-crypto', () => {
  const { gcm } = require('@noble/ciphers/aes.js');

  const mockNonceLength = 12;
  const mockTagLength = 16;

  class AESEncryptionKey {
    mockKeyBytes: Uint8Array;
    constructor(mockBytes: Uint8Array) {
      this.mockKeyBytes = mockBytes;
    }
    static import(input: Uint8Array | string): Promise<AESEncryptionKey> {
      const mockRaw = typeof input === 'string' ? Buffer.from(input, 'hex') : input;
      return Promise.resolve(new AESEncryptionKey(new Uint8Array(mockRaw)));
    }
    static generate(mockSize: number = 256): Promise<AESEncryptionKey> {
      const mockRaw = new Uint8Array(mockSize / 8);
      crypto.getRandomValues(mockRaw);
      return Promise.resolve(new AESEncryptionKey(mockRaw));
    }
    bytes(): Promise<Uint8Array> {
      return Promise.resolve(this.mockKeyBytes);
    }
    encoded(mockEncoding: 'hex' | 'base64'): Promise<string> {
      if (mockEncoding === 'hex') {
        return Promise.resolve(
          Array.from(this.mockKeyBytes, (mockByte: number) =>
            mockByte.toString(16).padStart(2, '0'),
          ).join(''),
        );
      }
      return Promise.resolve(Buffer.from(this.mockKeyBytes).toString('base64'));
    }
    get size() {
      return this.mockKeyBytes.length * 8;
    }
  }

  class AESSealedData {
    mockCombined: Uint8Array;
    mockIvLen: number;
    mockTagLen: number;

    constructor(mockData: Uint8Array, mockIvLength = mockNonceLength, mockTLen = mockTagLength) {
      this.mockCombined = mockData;
      this.mockIvLen = mockIvLength;
      this.mockTagLen = mockTLen;
    }

    static fromCombined(
      mockInput: Uint8Array | string,
      mockConfig?: { ivLength?: number; tagLength?: number },
    ): AESSealedData {
      const mockRaw = typeof mockInput === 'string' ? Buffer.from(mockInput, 'base64') : mockInput;
      return new AESSealedData(
        new Uint8Array(mockRaw),
        mockConfig?.ivLength ?? mockNonceLength,
        mockConfig?.tagLength ?? mockTagLength,
      );
    }

    static fromParts(
      mockIv: Uint8Array,
      mockCiphertext: Uint8Array,
      mockTagOrLength?: Uint8Array | number,
    ): AESSealedData {
      if (mockTagOrLength instanceof Uint8Array) {
        const mockResult = new Uint8Array(
          mockIv.length + mockCiphertext.length + mockTagOrLength.length,
        );
        mockResult.set(mockIv, 0);
        mockResult.set(mockCiphertext, mockIv.length);
        mockResult.set(mockTagOrLength, mockIv.length + mockCiphertext.length);
        return new AESSealedData(mockResult, mockIv.length, mockTagOrLength.length);
      }
      const mockResult = new Uint8Array(mockIv.length + mockCiphertext.length);
      mockResult.set(mockIv, 0);
      mockResult.set(mockCiphertext, mockIv.length);
      return new AESSealedData(mockResult, mockIv.length, mockTagOrLength ?? mockTagLength);
    }

    combined(): Uint8Array {
      return this.mockCombined;
    }

    iv(): Uint8Array {
      return this.mockCombined.slice(0, this.mockIvLen);
    }

    tag(): Uint8Array {
      return this.mockCombined.slice(this.mockCombined.length - this.mockTagLen);
    }

    get combinedSize() {
      return this.mockCombined.length;
    }
    get ivSize() {
      return this.mockIvLen;
    }
    get tagSize() {
      return this.mockTagLen;
    }
  }

  async function aesEncryptAsync(
    mockPlaintext: Uint8Array | string,
    mockKey: AESEncryptionKey,
  ): Promise<AESSealedData> {
    const mockData =
      typeof mockPlaintext === 'string'
        ? new Uint8Array(Buffer.from(mockPlaintext, 'base64'))
        : mockPlaintext;
    const mockNonce = new Uint8Array(mockNonceLength);
    crypto.getRandomValues(mockNonce);
    const mockCipher = gcm(mockKey.mockKeyBytes, mockNonce);
    const mockCtWithTag = mockCipher.encrypt(mockData);
    const mockResult = new Uint8Array(mockNonceLength + mockCtWithTag.length);
    mockResult.set(mockNonce, 0);
    mockResult.set(mockCtWithTag, mockNonceLength);
    return new AESSealedData(mockResult);
  }

  async function aesDecryptAsync(
    mockSealedData: AESSealedData,
    mockKey: AESEncryptionKey,
    mockOptions?: { output?: 'bytes' | 'base64' },
  ): Promise<Uint8Array | string> {
    const mockIv = mockSealedData.iv();
    const mockCtWithTag = mockSealedData.mockCombined.slice(mockSealedData.mockIvLen);
    const mockCipher = gcm(mockKey.mockKeyBytes, mockIv);
    const mockPlain = mockCipher.decrypt(mockCtWithTag);
    if (mockOptions?.output === 'base64') {
      return Buffer.from(mockPlain).toString('base64');
    }
    return new Uint8Array(mockPlain);
  }

  return {
    AESEncryptionKey,
    AESSealedData,
    aesEncryptAsync,
    aesDecryptAsync,
    getRandomBytes: (mockLen: number) => {
      const mockArr = new Uint8Array(mockLen);
      crypto.getRandomValues(mockArr);
      return mockArr;
    },
    getRandomValues: (mockArr: Uint8Array) => crypto.getRandomValues(mockArr),
    randomUUID: () => crypto.randomUUID(),
  };
});

// ---------------------------------------------------------------------------
// Mock: expo-local-authentication
// ---------------------------------------------------------------------------
let mockBiometricHardware = true;
let mockBiometricEnrolled = true;
let mockBiometricAuthResult = true;

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => mockBiometricHardware),
  isEnrolledAsync: jest.fn(async () => mockBiometricEnrolled),
  authenticateAsync: jest.fn(async () => ({ success: mockBiometricAuthResult })),
}));

(globalThis as any).__setBiometricHardware = (v: boolean) => {
  mockBiometricHardware = v;
};
(globalThis as any).__setBiometricEnrolled = (v: boolean) => {
  mockBiometricEnrolled = v;
};
(globalThis as any).__setBiometricAuthResult = (v: boolean) => {
  mockBiometricAuthResult = v;
};
