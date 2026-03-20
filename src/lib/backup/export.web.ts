import type { JournalContent } from '@/models';

export interface ExportManifest {
  version: 1;
  appVersion: string;
  exportDate: string;
  encrypted: boolean;
  salt?: string;
  kdfIterations?: number;
  journalTitle: string;
}

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'pages' | 'attachments' | 'zipping';
}

export async function exportJournal(
  _journal: JournalContent,
  _encrypted: boolean,
  _derivedKey?: Uint8Array,
  _onProgress?: (progress: ExportProgress) => void,
): Promise<void> {
  throw new Error('Backup export is not supported on web');
}
