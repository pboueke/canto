import { ensureDeviceKeyBootstrap } from '../bootstrap';
import { StorageIntegrityError } from '../integrity';
import type { LocalStore } from '../types';

const mockHasDeviceKey = jest.fn();
const mockHasPendingPreviousDeviceKey = jest.fn();
const mockRecoverKeyRotation = jest.fn();
jest.mock('@/lib/encryption/device', () => ({
  hasDeviceKey: (...args: unknown[]) => mockHasDeviceKey(...args),
  hasPendingPreviousDeviceKey: (...args: unknown[]) => mockHasPendingPreviousDeviceKey(...args),
  recoverKeyRotation: (...args: unknown[]) => mockRecoverKeyRotation(...args),
}));

function makeStore(overrides: Partial<LocalStore> = {}): {
  store: LocalStore;
  hasExistingData: jest.Mock;
  recordFirstInstall: jest.Mock;
} {
  const hasExistingData = jest.fn(async () => false);
  const recordFirstInstall = jest.fn(async () => undefined);
  return {
    store: { hasExistingData, recordFirstInstall, ...overrides } as unknown as LocalStore,
    hasExistingData,
    recordFirstInstall,
  };
}

describe('ensureDeviceKeyBootstrap', () => {
  beforeEach(() => {
    mockHasDeviceKey.mockReset();
    mockHasPendingPreviousDeviceKey.mockReset();
    mockHasPendingPreviousDeviceKey.mockResolvedValue(false);
    mockRecoverKeyRotation.mockReset();
    mockRecoverKeyRotation.mockResolvedValue(undefined);
  });

  it('records the first-install marker on a genuinely fresh install (no key, no data)', async () => {
    mockHasDeviceKey.mockResolvedValue(false);
    const { store, hasExistingData, recordFirstInstall } = makeStore();

    await expect(ensureDeviceKeyBootstrap(store)).resolves.toBeUndefined();
    expect(hasExistingData).toHaveBeenCalledTimes(1);
    expect(recordFirstInstall).toHaveBeenCalledTimes(1);
  });

  it('fails closed with DEVICE_KEY_UNAVAILABLE when data exists but no key is accessible', async () => {
    mockHasDeviceKey.mockResolvedValue(false);
    const { store, hasExistingData, recordFirstInstall } = makeStore();
    hasExistingData.mockResolvedValue(true);

    let error: unknown;
    try {
      await ensureDeviceKeyBootstrap(store);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(StorageIntegrityError);
    expect((error as StorageIntegrityError).code).toBe('DEVICE_KEY_UNAVAILABLE');
    // The fresh-install marker must never be written over existing evidence.
    expect(recordFirstInstall).not.toHaveBeenCalled();
  });

  it('does nothing when the device key already exists', async () => {
    mockHasDeviceKey.mockResolvedValue(true);
    const { store, hasExistingData, recordFirstInstall } = makeStore();

    await expect(ensureDeviceKeyBootstrap(store)).resolves.toBeUndefined();
    expect(hasExistingData).not.toHaveBeenCalled();
    expect(recordFirstInstall).not.toHaveBeenCalled();
  });

  it('restores a pending previous key from an interrupted rotation before probing for data', async () => {
    // A crash between beginKeyRotation's fallback write and its current-key
    // write leaves only the previous key durable.
    mockHasDeviceKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockHasPendingPreviousDeviceKey.mockResolvedValue(true);
    const { store, hasExistingData, recordFirstInstall } = makeStore();

    await expect(ensureDeviceKeyBootstrap(store)).resolves.toBeUndefined();
    expect(mockRecoverKeyRotation).toHaveBeenCalledWith(false);
    // Existing data must never be probed for the fresh-install decision after
    // the fallback key was restored.
    expect(hasExistingData).not.toHaveBeenCalled();
    expect(recordFirstInstall).not.toHaveBeenCalled();
  });

  it('still fails closed when restoring the pending key does not make a key available', async () => {
    mockHasDeviceKey.mockResolvedValue(false);
    mockHasPendingPreviousDeviceKey.mockResolvedValue(true);
    const { store, hasExistingData, recordFirstInstall } = makeStore();
    hasExistingData.mockResolvedValue(true);

    let error: unknown;
    try {
      await ensureDeviceKeyBootstrap(store);
    } catch (err) {
      error = err;
    }
    expect(mockRecoverKeyRotation).toHaveBeenCalledWith(false);
    expect(error).toBeInstanceOf(StorageIntegrityError);
    expect((error as StorageIntegrityError).code).toBe('DEVICE_KEY_UNAVAILABLE');
    expect(recordFirstInstall).not.toHaveBeenCalled();
  });

  it('never writes the marker when storage probing itself fails', async () => {
    mockHasDeviceKey.mockResolvedValue(false);
    const { store, recordFirstInstall } = makeStore();
    store.hasExistingData = jest.fn(async () => {
      throw new Error('storage unavailable');
    });

    await expect(ensureDeviceKeyBootstrap(store)).rejects.toThrow('storage unavailable');
    expect(recordFirstInstall).not.toHaveBeenCalled();
  });
});
