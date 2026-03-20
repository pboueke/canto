import type { ExportManifest } from './export';

export interface ImportResult {
  journalId: string;
  title: string;
}

export interface ImportInfo {
  manifest: ExportManifest;
  needsPassword: boolean;
  canProvidePassword: boolean;
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments';
}

export async function inspectBackup(_zipUri: string): Promise<ImportInfo> {
  throw new Error('Backup import is not supported on web');
}

export async function importJournal(
  _zipUri: string,
  _title: string,
  _providedKey?: Uint8Array,
  _onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  throw new Error('Backup import is not supported on web');
}

export { hasNameConflict, resolveNameConflict } from './conflicts';
