import type { ImportProgress, ImportResult } from './import-types';

/** Flat v1 AES-GCM entries cannot be authenticated incrementally. */
export const MAX_LEGACY_ENCRYPTED_ENTRY_BYTES = 32 * 1024 * 1024;

/**
 * The Android archive bridge is intentionally unavailable on the browser.
 * `import.web.ts` selects the JSZip importer; this module keeps an accidental
 * direct import from loading native filesystem bindings in a web bundle.
 */
export async function importNativeJournal(
  _zipUri: string,
  _title: string,
  _providedKey?: Uint8Array,
  _onProgress?: (progress: ImportProgress) => void,
  _signal?: AbortSignal,
  _expectedSourceFingerprint?: string,
): Promise<ImportResult> {
  throw new Error('Native archive import is unavailable on web');
}
