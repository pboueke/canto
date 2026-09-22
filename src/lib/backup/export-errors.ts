import { StorageIntegrityError } from '@/lib/storage/integrity';

/**
 * Typed, user-safe classification of export failures. The export UI must be
 * able to distinguish journal-integrity problems (unreadable data), archive
 * construction/storage failures, and native share-sheet failures without ever
 * exposing keys, paths, or plaintext in the message.
 */
export type ExportErrorKind = 'integrity' | 'archive' | 'share';

export class ExportError extends Error {
  readonly kind: ExportErrorKind;

  constructor(kind: ExportErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'ExportError';
    this.kind = kind;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}

/**
 * Classify failures raised while materializing journal data (pages and
 * attachments). Storage-integrity and data-read failures are integrity
 * problems; everything else in this phase is also data-related, so the export
 * fails closed with the integrity classification rather than producing a
 * partial archive.
 */
export function classifyExportDataFailure(error: unknown): ExportError {
  if (isExportError(error)) return error;
  if (error instanceof StorageIntegrityError) {
    return new ExportError('integrity', 'Journal data could not be read safely.', error);
  }
  return new ExportError('integrity', 'Journal data could not be read safely.', error);
}
