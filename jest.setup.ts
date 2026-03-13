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
