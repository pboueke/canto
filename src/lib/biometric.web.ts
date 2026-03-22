/**
 * Web stub for biometric authentication.
 * Biometrics are not available in browsers.
 */

export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function authenticateBiometric(_reason: string): Promise<boolean> {
  return false;
}

export async function storeBiometricKey(_journalId: string, _key: Uint8Array): Promise<void> {
  // no-op on web
}

export async function getBiometricKey(_journalId: string): Promise<Uint8Array | null> {
  return null;
}

export async function clearBiometricKey(_journalId: string): Promise<void> {
  // no-op on web
}
