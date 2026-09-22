import { ATTACHMENT_CHUNK_SIZE } from '../storage/attachment-content';
import { estimateNativeImportDiskUse } from '../backup/native-import-estimate';

describe('native import disk estimator', () => {
  it('accounts for encrypted chunk framing, temporary extraction, and shared copies', () => {
    const entries = [
      {
        name: 'manifest.json',
        size: 100,
        compressedSize: 100,
        method: 0,
        crc: 1,
        directory: false,
      },
      { name: 'journal.json', size: 100, compressedSize: 100, method: 0, crc: 1, directory: false },
      {
        name: 'attachments/image-a.jpg',
        size: ATTACHMENT_CHUNK_SIZE * 2,
        compressedSize: ATTACHMENT_CHUNK_SIZE,
        method: 8,
        crc: 1,
        directory: false,
      },
    ];

    const oneCopy = estimateNativeImportDiskUse(
      entries,
      new Map([['attachments/image-a.jpg', 1]]),
      ATTACHMENT_CHUNK_SIZE,
    );
    const shared = estimateNativeImportDiskUse(
      entries,
      new Map([['attachments/image-a.jpg', 2]]),
      ATTACHMENT_CHUNK_SIZE,
    );

    expect(oneCopy.largestTemporaryEntryBytes).toBe(ATTACHMENT_CHUNK_SIZE * 2);
    expect(oneCopy.requiredBytes).toBeGreaterThan(oneCopy.localStorageBytes);
    expect(shared.localStorageBytes).toBeGreaterThan(oneCopy.localStorageBytes);
    expect(shared.requiredBytes).toBeGreaterThan(oneCopy.requiredBytes);
  });

  it('ignores directory entries and unowned attachments', () => {
    const entries = [
      { name: 'pages/', size: 0, compressedSize: 0, method: 0, crc: 0, directory: true },
      {
        name: 'attachments/image-a.jpg',
        size: 1_000,
        compressedSize: 1_000,
        method: 0,
        crc: 1,
        directory: false,
      },
    ];

    const estimate = estimateNativeImportDiskUse(entries, new Map(), ATTACHMENT_CHUNK_SIZE);
    expect(estimate.localStorageBytes).toBe(0);
    expect(estimate.largestTemporaryEntryBytes).toBe(1_000);
  });
});
