import type { Attachment } from 'canto-data';
import { persistPickedImage } from '../image-ingestion';

const mockGenerateThumbnail = jest.fn();
jest.mock('@/lib/backup/import-thumbnail', () => ({
  generateImportThumbnailFromChunks: (...args: unknown[]) => mockGenerateThumbnail(...args),
}));

const image: Attachment = {
  id: 'image-1',
  path: '',
  name: 'image.png',
  type: 'image',
  encrypted: true,
  size: 4,
  content: {
    format: 'canto-chunked-v1',
    chunkSize: 4,
    chunkCount: 1,
    generation: 'generation-1',
    byteLength: 4,
  },
  deleted: false,
};

describe('persistPickedImage', () => {
  it('persists a thumbnail for an encrypted picked image without reassembling its stored chunks', async () => {
    const source = {
      size: 4,
      chunks: jest.fn(async function* () {
        yield new Uint8Array([1, 2, 3, 4]);
      }),
    };
    const save = jest.fn(async (chunks: AsyncIterable<Uint8Array>) => {
      const received: number[] = [];
      for await (const chunk of chunks) received.push(...chunk);
      expect(received).toEqual([1, 2, 3, 4]);
      return 'canto/j1/attachments/image-1';
    });
    mockGenerateThumbnail.mockResolvedValue('dGh1bWJuYWls');

    await expect(persistPickedImage({ attachment: image, source, save })).resolves.toEqual({
      attachment: { ...image, path: 'canto/j1/attachments/image-1' },
      thumbnail: 'dGh1bWJuYWls',
    });

    expect(source.chunks).toHaveBeenCalledTimes(2);
    expect(mockGenerateThumbnail).toHaveBeenCalledWith(expect.anything(), 4, 'image.png');
  });
});
