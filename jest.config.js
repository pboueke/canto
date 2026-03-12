/** @type {import('jest').Config} */
const config = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', '!**/*.d.ts'],
};

module.exports = config;
