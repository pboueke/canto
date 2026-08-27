import * as ImageManipulator from 'expo-image-manipulator';
import { Paths, File as ExpoFile } from 'expo-file-system';

async function manipulateThumbnail(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 120 } }], {
    compress: 0.5,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  try {
    const resultFile = new ExpoFile(result.uri);
    if (resultFile.exists) resultFile.delete();
  } catch {
    // The source thumbnail is still usable; cache cleanup is best effort.
  }

  if (!result.base64) throw new Error('Thumbnail encoder returned no base64 output');
  return result.base64;
}

/**
 * Generate a small base64 JPEG thumbnail from a base64-encoded image.
 * This legacy helper remains for callers that already have a small base64 value.
 */
export async function generateThumbnail(base64Image: string): Promise<string> {
  const srcFile = new ExpoFile(
    Paths.cache,
    `thumb-src-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );
  if (!srcFile.exists) srcFile.create({ intermediates: true });
  srcFile.write(base64Image, { encoding: 'base64' });

  try {
    return await manipulateThumbnail(srcFile.uri);
  } finally {
    try {
      if (srcFile.exists) srcFile.delete();
    } catch {
      // Ignore cache cleanup errors.
    }
  }
}

/**
 * Generate an import thumbnail without ever creating a base64 copy of the
 * original. ZIP/decrypted bytes are written sequentially to a cache file and
 * the platform decoder receives only its URI.
 */
export async function generateThumbnailFromChunks(
  chunks: AsyncIterable<Uint8Array>,
  sourceName?: string,
): Promise<string> {
  const extension = sourceName?.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? 'img';
  const srcFile = new ExpoFile(
    Paths.cache,
    `import-thumb-src-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
  );
  if (!srcFile.exists) srcFile.create({ intermediates: true });

  try {
    const handle = srcFile.open();
    try {
      for await (const chunk of chunks) handle.writeBytes(chunk);
    } finally {
      handle.close();
    }
    return await manipulateThumbnail(srcFile.uri);
  } finally {
    try {
      if (srcFile.exists) srcFile.delete();
    } catch {
      // Ignore cache cleanup errors.
    }
  }
}
