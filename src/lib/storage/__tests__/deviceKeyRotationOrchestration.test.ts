import type { EncryptionService } from '@/lib/encryption';
import {
  createRotationVerifySampler,
  RotationBlockedError,
  runDeviceKeyRotation,
  type DeviceKeyCustody,
  type DeviceKeyRotationIO,
} from '../device-key-rotation';
import { RotationInterruptedError } from '../integrity';

function createIO(overrides: Partial<DeviceKeyRotationIO> = {}): DeviceKeyRotationIO {
  return {
    preflight: jest.fn(async () => {}),
    stage: jest.fn(async () => {}),
    discard: jest.fn(async () => {}),
    markCommitting: jest.fn(async () => {}),
    isCommitting: jest.fn(async () => true),
    apply: jest.fn(async () => {}),
    verify: jest.fn(async () => {}),
    cleanup: jest.fn(async () => {}),
    clearCompletionMarker: jest.fn(async () => {}),
    seal: jest.fn(),
    ...overrides,
  };
}

function createCustody(overrides: Partial<DeviceKeyCustody> = {}): DeviceKeyCustody {
  return {
    hasPendingPreviousDeviceKey: jest.fn(async () => false),
    prepareKeyRotation: jest.fn(async () => ({
      oldKey: new Uint8Array(32).fill(1),
      newKey: new Uint8Array(32).fill(2),
    })),
    beginKeyRotation: jest.fn(async () => {}),
    abortKeyRotation: jest.fn(async () => {}),
    commitKeyRotation: jest.fn(async () => {}),
    ...overrides,
  };
}

const encryption = {
  decrypt: jest.fn(async () => {
    throw new Error('cached key cannot open this');
  }),
  clearSession: jest.fn(),
} as unknown as EncryptionService;

describe('runDeviceKeyRotation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('seals and keeps both keys when the commit marker state is unknown', async () => {
    const io = createIO({
      markCommitting: jest.fn(async () => {
        throw new Error('EIO');
      }),
      isCommitting: jest.fn(async () => {
        throw new Error('EIO again');
      }),
    });
    const custody = createCustody();
    await expect(runDeviceKeyRotation(io, custody, encryption)).rejects.toBeInstanceOf(
      RotationInterruptedError,
    );
    expect(io.seal).toHaveBeenCalled();
    expect(custody.abortKeyRotation).not.toHaveBeenCalled();
    expect(io.discard).not.toHaveBeenCalled();
  });

  it('falls back to the durable old key when the cached key cannot decrypt', async () => {
    const io = createIO({
      stage: jest.fn(async (oldDecrypt) => {
        await expect(oldDecrypt('not-a-ciphertext')).rejects.toThrow();
      }),
    });
    await runDeviceKeyRotation(io, createCustody(), encryption);
    expect(encryption.decrypt).toHaveBeenCalledWith('not-a-ciphertext');
  });

  it('discards staging and never touches keys when staging is refused', async () => {
    const custody = createCustody();
    const io = createIO({
      stage: jest.fn(async () => {
        throw new RotationBlockedError('UNREADABLE_DATA', 'unreadable');
      }),
    });
    await expect(runDeviceKeyRotation(io, custody, encryption)).rejects.toMatchObject({
      reason: 'UNREADABLE_DATA',
    });
    expect(io.discard).toHaveBeenCalled();
    expect(custody.beginKeyRotation).not.toHaveBeenCalled();
  });
});

describe('createRotationVerifySampler', () => {
  it('samples the index, metadata, catalogs, and a bounded number of pages per journal', () => {
    const sample = createRotationVerifySampler();
    expect(sample('/r/canto/journals.json')).toBe(true);
    expect(sample('/r/canto/j1/metadata.json')).toBe(true);
    expect(sample('/r/canto/j1/page-catalog.json')).toBe(true);
    expect(sample('/r/canto/j1/attachments/a.jpg')).toBe(false);
    expect(sample('/r/canto/j1/drafts/p1.json')).toBe(false);
    expect(sample('/r/canto/j1/pages/p1.json.tmp')).toBe(false);
    const pages = Array.from({ length: 12 }, (_, i) => sample(`/r/canto/j1/pages/p${i}.json`));
    expect(pages.filter(Boolean)).toHaveLength(10);
    expect(sample('/r/canto/j2/pages/p0.json')).toBe(true);
  });
});
