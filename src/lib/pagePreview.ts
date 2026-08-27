import { pageToPreview } from 'canto-data';
import type { Attachment, Page, PagePreview } from 'canto-data';
import { LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES } from '@/lib/storage/attachment-content';

export interface ListPagePreview extends PagePreview {
  /** Retained in the catalog for sync/local consistency; list views filter it out. */
  deleted?: boolean;
  firstImageEncrypted?: boolean;
  /** Metadata-only size used to keep automatic legacy previews bounded. */
  firstImageSize?: number;
  /** A list must never reconstruct a chunked original merely to make a preview. */
  firstImageChunked?: boolean;
  /** Used by the encrypted catalog for incremental invalidation and sync state. */
  modified?: number;
}

/**
 * Automatic list thumbnails may read a legacy source only when its declared
 * size fits in one bounded legacy value. Unknown sizes must not be opened just
 * to create a decorative preview; the list uses its normal placeholder.
 */
export function canGenerateThumbnailFromAttachment(attachment: Attachment | undefined): boolean {
  return Boolean(
    attachment &&
    attachment.content?.format !== 'canto-chunked-v1' &&
    attachment.size != null &&
    attachment.size <= LEGACY_ATTACHMENT_MEMORY_LIMIT_BYTES,
  );
}

/**
 * Build a list preview without dropping password-protected images.
 * The list item uses firstImageEncrypted to request the attachment with the right key.
 */
export function pageToListPreview(page: Page): ListPagePreview {
  const firstImage = page.images.find((image) => !image.deleted);
  return {
    ...pageToPreview(page),
    modified: page.modified,
    deleted: page.deleted,
    firstImage: firstImage?.path,
    firstImageEncrypted: firstImage?.encrypted,
    firstImageSize: firstImage?.size,
    firstImageChunked: firstImage?.content?.format === 'canto-chunked-v1',
  };
}
