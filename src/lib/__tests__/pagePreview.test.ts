import type { Page } from 'canto-data';
import { canGenerateThumbnailFromAttachment, pageToListPreview } from '@/lib/pagePreview';

function makePage(): Page {
  return {
    id: 'p1',
    text: 'An entry',
    date: '2026-01-01T00:00:00.000Z',
    tags: [],
    files: [],
    images: [
      {
        id: 'image-1',
        path: 'canto/j1/attachments/i-image-1.jpg',
        name: 'image-1.jpg',
        type: 'image',
        encrypted: true,
        deleted: false,
      },
    ],
    comments: [],
    modified: 0,
    deleted: false,
  };
}

describe('pageToListPreview', () => {
  it('keeps the first image and its password-layer state for secure journals', () => {
    expect(pageToListPreview(makePage())).toMatchObject({
      firstImage: 'canto/j1/attachments/i-image-1.jpg',
      firstImageEncrypted: true,
      firstImageChunked: false,
    });
  });

  it('refuses automatic thumbnail generation from a chunked original', () => {
    const page = makePage();
    page.images[0].content = {
      format: 'canto-chunked-v1',
      byteLength: 1,
      chunkSize: 512 * 1024,
      chunkCount: 1,
      generation: 'generation-1',
    };

    expect(canGenerateThumbnailFromAttachment(page.images[0])).toBe(false);
    expect(canGenerateThumbnailFromAttachment(makePage().images[0])).toBe(false);
    expect(canGenerateThumbnailFromAttachment({ ...makePage().images[0], size: 512 * 1024 })).toBe(
      true,
    );
  });

  it('refuses unknown and oversized legacy originals for automatic thumbnails', () => {
    expect(canGenerateThumbnailFromAttachment(makePage().images[0])).toBe(false);
    expect(
      canGenerateThumbnailFromAttachment({ ...makePage().images[0], size: 512 * 1024 + 1 }),
    ).toBe(false);
  });

  it('marks a chunked original so list rendering never opens it for a thumbnail', () => {
    const page = makePage();
    page.images[0].content = {
      format: 'canto-chunked-v1',
      byteLength: 1,
      chunkSize: 512 * 1024,
      chunkCount: 1,
      generation: 'generation-1',
    };
    expect(pageToListPreview(page).firstImageChunked).toBe(true);
  });
});
