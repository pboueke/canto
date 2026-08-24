export interface SyncWarningMessages {
  legacyAttachmentTooLarge: string;
  chunkGenerationMissing: string;
  attachmentNotFound: string;
}

function formatBytes(bytes: number, locale: string): string {
  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.ceil(bytes / 1024))} KB`;
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))} MB`;
}

/** Localized, reason-specific warning line used by sync and cloud import results. */
export function formatSyncWarning(
  warning: { name: string; size?: number; reason: string },
  locale: string,
  messages: SyncWarningMessages,
): string {
  const message =
    warning.reason === 'chunk-generation-missing'
      ? messages.chunkGenerationMissing
      : warning.reason === 'attachment-not-found'
        ? messages.attachmentNotFound
        : messages.legacyAttachmentTooLarge;
  return `${warning.name}${warning.size === undefined ? '' : ` (${formatBytes(warning.size, locale)})`}: ${message}`;
}
