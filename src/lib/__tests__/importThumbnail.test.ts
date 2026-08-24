import JSZip from 'jszip';
import {
  generateImportThumbnail,
  imageDimensionsFromHeader,
  IMPORT_THUMBNAIL_MAX_BYTES,
  IMPORT_THUMBNAIL_MAX_PIXELS,
  IMPORT_THUMBNAIL_SOURCE_LIMIT_BYTES,
  isSafeThumbnailDimensions,
} from '../backup/import-thumbnail';
import * as encryptionUtils from '../encryption/utils';

const mockGenerateThumbnailFromChunks = jest.fn();
jest.mock('@/lib/thumbnail', () => ({
  generateThumbnailFromChunks: (...args: unknown[]) => mockGenerateThumbnailFromChunks(...args),
}));

const PNG_HEADER = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1,
]);

async function imageEntry(bytes: Uint8Array): Promise<JSZip.JSZipObject> {
  const source = new JSZip();
  source.file('attachments/image-image.png', bytes);
  const loaded = await JSZip.loadAsync(await source.generateAsync({ type: 'uint8array' }));
  const entry = loaded.file('attachments/image-image.png');
  if (!entry) throw new Error('test ZIP entry missing');
  return entry;
}

describe('generateImportThumbnail', () => {
  beforeEach(() => mockGenerateThumbnailFromChunks.mockReset());

  it('does not read an image source beyond the bounded import thumbnail limit', async () => {
    const result = await generateImportThumbnail(
      {} as JSZip.JSZipObject,
      IMPORT_THUMBNAIL_SOURCE_LIMIT_BYTES + 1,
    );

    expect(result).toBeNull();
    expect(mockGenerateThumbnailFromChunks).not.toHaveBeenCalled();
  });

  it('skips invalid headers before invoking the platform decoder', async () => {
    await expect(
      generateImportThumbnail(await imageEntry(new Uint8Array([1, 2, 3])), 3),
    ).resolves.toBeNull();
    expect(mockGenerateThumbnailFromChunks).not.toHaveBeenCalled();
  });

  it('skips image headers whose decoded pixel count is unsafe', async () => {
    const largePng = PNG_HEADER.slice();
    // 4097 × 4096 is one pixel above the 16 MP cap.
    largePng.set([0, 0, 0x10, 1, 0, 0, 0x10, 0], 16);

    await expect(
      generateImportThumbnail(await imageEntry(largePng), largePng.length),
    ).resolves.toBeNull();
    expect(mockGenerateThumbnailFromChunks).not.toHaveBeenCalled();
    expect(isSafeThumbnailDimensions(imageDimensionsFromHeader(largePng))).toBe(false);
    expect(IMPORT_THUMBNAIL_MAX_PIXELS).toBe(16 * 1024 * 1024);
  });

  it('streams a valid unencrypted image to the platform decoder without source base64 conversion', async () => {
    mockGenerateThumbnailFromChunks.mockImplementation(
      async (chunks: AsyncIterable<Uint8Array>) => {
        const read: Uint8Array[] = [];
        for await (const chunk of chunks) read.push(chunk);
        return 'dGh1bWJuYWls';
      },
    );
    const base64Spy = jest.spyOn(encryptionUtils, 'uint8ToBase64');

    await expect(
      generateImportThumbnail(await imageEntry(PNG_HEADER), PNG_HEADER.length),
    ).resolves.toBe('dGh1bWJuYWls');
    expect(mockGenerateThumbnailFromChunks).toHaveBeenCalledTimes(1);
    expect(base64Spy).not.toHaveBeenCalled();
  });

  it('uses decrypted attachment data as chunked bytes, not a source data URL', async () => {
    mockGenerateThumbnailFromChunks.mockImplementation(
      async (chunks: AsyncIterable<Uint8Array>) => {
        const read: number[] = [];
        for await (const chunk of chunks) read.push(...chunk);
        expect(read).toEqual([...PNG_HEADER]);
        return 'dGh1bWJuYWls';
      },
    );

    const encryptedEntry = await imageEntry(new Uint8Array([0]));
    await expect(
      generateImportThumbnail(
        encryptedEntry,
        PNG_HEADER.length,
        btoa(String.fromCharCode(...PNG_HEADER)),
      ),
    ).resolves.toBe('dGh1bWJuYWls');
  });

  it('refuses unexpectedly large encoded thumbnail output', async () => {
    mockGenerateThumbnailFromChunks.mockResolvedValue(
      'A'.repeat(Math.ceil((IMPORT_THUMBNAIL_MAX_BYTES * 4) / 3) + 8),
    );

    await expect(
      generateImportThumbnail(await imageEntry(PNG_HEADER), PNG_HEADER.length),
    ).resolves.toBeNull();
  });
});
