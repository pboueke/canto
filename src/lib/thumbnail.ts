import * as ImageManipulator from 'expo-image-manipulator';
import { Paths, File as ExpoFile } from 'expo-file-system';

/**
 * Generate a small base64 JPEG thumbnail from a base64-encoded image.
 * Returns the thumbnail as a base64 string (no data URI prefix).
 */
export async function generateThumbnail(base64Image: string): Promise<string> {
  // Write source image to a temp file
  const srcFile = new ExpoFile(
    Paths.cache,
    `thumb-src-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
  );
  if (!srcFile.exists) srcFile.create({ intermediates: true });
  srcFile.write(base64Image, { encoding: 'base64' });

  try {
    const result = await ImageManipulator.manipulateAsync(
      srcFile.uri,
      [{ resize: { width: 80 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    // Clean up result file
    try {
      const resultFile = new ExpoFile(result.uri);
      if (resultFile.exists) resultFile.delete();
    } catch {
      // ignore cleanup errors
    }

    return result.base64!;
  } finally {
    // Clean up source temp file
    try {
      if (srcFile.exists) srcFile.delete();
    } catch {
      // ignore cleanup errors
    }
  }
}
