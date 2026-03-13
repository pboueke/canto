import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

export async function authenticateBiometric(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: '',
    disableDeviceFallback: true,
  });
  return result.success;
}

function biometricKeyAlias(journalId: string): string {
  return `canto_bio_key_${journalId}`;
}

export async function storeBiometricKey(journalId: string, key: Uint8Array): Promise<void> {
  try {
    await SecureStore.setItemAsync(biometricKeyAlias(journalId), bytesToHex(key), {
      requireAuthentication: true,
    });
  } catch {
    // requireAuthentication may not be supported on all platforms — silently fail
  }
}

export async function getBiometricKey(journalId: string): Promise<Uint8Array | null> {
  try {
    const hex = await SecureStore.getItemAsync(biometricKeyAlias(journalId), {
      requireAuthentication: true,
    });
    if (!hex) return null;
    return hexToBytes(hex);
  } catch {
    return null;
  }
}

export async function clearBiometricKey(journalId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(biometricKeyAlias(journalId));
  } catch {
    // ignore
  }
}
