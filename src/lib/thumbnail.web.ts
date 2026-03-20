/**
 * Web stub for thumbnail generation.
 * Returns the input image unchanged — web has more bandwidth/memory
 * than mobile so full-size base64 is acceptable for thumbnails.
 */
export async function generateThumbnail(base64Image: string): Promise<string> {
  return base64Image;
}
