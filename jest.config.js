/** @type {import('jest').Config} */
const config = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@noble/ciphers/(.*)\\.js$': '<rootDir>/node_modules/@noble/ciphers/$1.js',
    '^@noble/hashes/(.*)\\.js$': '<rootDir>/node_modules/@noble/hashes/$1.js',
    '^expo-file-system/next$': '<rootDir>/src/__mocks__/expo-file-system-next.ts',
    '^expo-auth-session/providers/google$': '<rootDir>/src/__mocks__/expo-auth-session-providers-google.ts',
    '^expo-auth-session$': '<rootDir>/src/__mocks__/expo-auth-session.ts',
    '^expo-web-browser$': '<rootDir>/src/__mocks__/expo-web-browser.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/helpers/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/ciphers|@noble/hashes|expo-crypto)',
    '/canto-data/dist/',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!src/components/**',
    '!app/**',
    '!src/lib/encryption/types.ts',
    '!src/lib/storage/types.ts',
    '!src/lib/sync/types.ts',
    '!src/lib/devTools.ts',
    '!**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
};

module.exports = config;
