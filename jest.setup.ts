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
