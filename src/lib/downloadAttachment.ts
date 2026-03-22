import * as Sharing from 'expo-sharing';

/**
 * Download/share an attachment from base64 data (native implementation).
 * Writes to a temp file and opens the system share sheet.
 */
export async function downloadAttachment(base64Data: string, filename: string): Promise<void> {
  const { Paths, File: ExpoFile } = require('expo-file-system');
  const tempFile = new ExpoFile(Paths.cache, filename);
  if (!tempFile.exists) {
    tempFile.create({ intermediates: true });
  }
  tempFile.write(base64Data, { encoding: 'base64' });
  await Sharing.shareAsync(tempFile.uri);
}
