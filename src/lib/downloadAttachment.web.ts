/**
 * Download an attachment from base64 data (web implementation).
 * Creates a Blob and triggers a download via a temporary anchor element.
 */
export async function downloadAttachment(base64Data: string, filename: string): Promise<void> {
  const byteChars = atob(base64Data);
  const byteNumbers = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteNumbers]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
