const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_MAX_BYTES = 128 * 1024;

async function thumbnailFromUri(uri: string): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Browser thumbnail decoding is unavailable');
  }

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Image thumbnail decode failed'));
  });
  image.src = uri;
  await loaded;

  const scale = Math.min(1, THUMBNAIL_WIDTH / Math.max(image.naturalWidth || image.width, 1));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser thumbnail canvas is unavailable');
  context.drawImage(image, 0, 0, width, height);

  const encoded = canvas.toDataURL('image/jpeg', 0.6).split(',', 2)[1] ?? '';
  const bytes = Math.floor((encoded.length * 3) / 4) - (encoded.endsWith('==') ? 2 : 0);
  if (!encoded || bytes > THUMBNAIL_MAX_BYTES) {
    throw new Error('Generated thumbnail exceeds size limit');
  }
  return encoded;
}

/**
 * Legacy helper for callers that already hold a small base64 image. Import code
 * must use generateThumbnailFromChunks so originals never become data URLs.
 */
export async function generateThumbnail(base64Image: string): Promise<string> {
  if (!base64Image || typeof document === 'undefined') {
    throw new Error('Browser thumbnail decoding is unavailable');
  }
  return thumbnailFromUri(`data:image/*;base64,${base64Image}`);
}

/**
 * Decode an import source through a Blob object URL. The original is never
 * converted to a data URL/base64 string, and the object URL is always revoked.
 */
export async function generateThumbnailFromChunks(
  chunks: AsyncIterable<Uint8Array>,
  _sourceName?: string,
): Promise<string> {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || !URL.createObjectURL) {
    throw new Error('Browser thumbnail decoding is unavailable');
  }

  const parts: BlobPart[] = [];
  for await (const chunk of chunks) {
    // Slice to an ArrayBuffer with the exact byte range: a Uint8Array's backing
    // buffer can otherwise contain unrelated bytes.
    parts.push(chunk.slice().buffer);
  }
  const uri = URL.createObjectURL(new Blob(parts));
  try {
    return await thumbnailFromUri(uri);
  } finally {
    URL.revokeObjectURL(uri);
  }
}
