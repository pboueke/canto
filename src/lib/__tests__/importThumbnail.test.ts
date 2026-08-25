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

  it('supports GIF, JPEG, and each WebP image header form without decoding the source', () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x34, 0x12, 0x78, 0x56]);
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xc0, 0, 8, 8, 0, 0x20, 0, 0x10, 3,
    ]);
    const vp8x = new Uint8Array(30);
    vp8x.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    vp8x.set([4, 0, 0], 24);
    vp8x.set([2, 0, 0], 27);
    const vp8 = vp8x.slice();
    vp8.set([0x56, 0x50, 0x38, 0x20], 12);
    vp8.set([0x9d, 0x01, 0x2a, 0x34, 0x12, 0x78, 0x56], 23);
    const vp8l = new Uint8Array(30);
    vp8l.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
    vp8l.set([0x2f, 2, 0, 0, 0], 20);

    expect(imageDimensionsFromHeader(gif)).toEqual({ width: 0x1234, height: 0x5678 });
    expect(imageDimensionsFromHeader(jpeg)).toEqual({ width: 16, height: 32 });
    expect(imageDimensionsFromHeader(vp8x)).toEqual({ width: 5, height: 3 });
    expect(imageDimensionsFromHeader(vp8)).toEqual({ width: 0x1234, height: 0x1678 });
    expect(imageDimensionsFromHeader(vp8l)).toEqual({ width: 3, height: 1 });
  });

  it('rejects malformed, zero-sized, non-integer, and excessive dimensions', () => {
    expect(imageDimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(isSafeThumbnailDimensions(null)).toBe(false);
    expect(isSafeThumbnailDimensions({ width: 0, height: 1 })).toBe(false);
    expect(isSafeThumbnailDimensions({ width: 1.5, height: 1 })).toBe(false);
    expect(isSafeThumbnailDimensions({ width: 4096, height: 4096 })).toBe(true);
  });

  it('rejects truncated JPEG segments and empty decrypted streams without decoding', async () => {
    // Standalone JPEG markers have no length; each malformed continuation must
    // be rejected without ever entering the platform image decoder.
    expect(
      imageDimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd0, 0xff, 0xd9, 0, 0, 0, 0])),
    ).toBeNull();
    expect(
      imageDimensionsFromHeader(
        new Uint8Array([0xff, 0xd8, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      ),
    ).toBeNull();
    expect(
      imageDimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 0, 0, 0, 0])),
    ).toBeNull();
    expect(
      imageDimensionsFromHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 7, 0, 0, 0, 0])),
    ).toBeNull();

    await expect(generateImportThumbnail({} as JSZip.JSZipObject, 1, '')).resolves.toBeNull();
    expect(mockGenerateThumbnailFromChunks).not.toHaveBeenCalled();
  });

  it('returns null for empty sources and decoder failures', async () => {
    await expect(generateImportThumbnail({} as JSZip.JSZipObject, 0)).resolves.toBeNull();
    mockGenerateThumbnailFromChunks.mockRejectedValue(new Error('decoder failed'));
    await expect(
      generateImportThumbnail(await imageEntry(PNG_HEADER), PNG_HEADER.length),
    ).resolves.toBeNull();
  });
});
