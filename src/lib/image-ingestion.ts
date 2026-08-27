import type { Attachment } from 'canto-data';
import { generateImportThumbnailFromChunks } from '@/lib/backup/import-thumbnail';

export interface PickedAttachmentSource {
  size: number;
  /** Returns a new bounded reader so persistence and preview generation never share a stream. */
  chunks(): AsyncIterable<Uint8Array>;
}

interface PersistPickedImageInput {
  attachment: Attachment;
  source: PickedAttachmentSource;
  save(chunks: AsyncIterable<Uint8Array>): Promise<string>;
}

/**
 * Persist a picked image and build its bounded preview from the picker source.
 * The stored attachment remains chunked; a thumbnail never reassembles it.
 */
export async function persistPickedImage({
  attachment,
  source,
  save,
}: PersistPickedImageInput): Promise<{ attachment: Attachment; thumbnail: string | null }> {
  const [path, thumbnail] = await Promise.all([
    save(source.chunks()),
    generateImportThumbnailFromChunks(source.chunks(), source.size, attachment.name),
  ]);
  return { attachment: { ...attachment, path }, thumbnail };
}
