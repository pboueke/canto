import type { ExportManifest } from 'canto-data/format';

export interface AttachmentError {
  name: string;
  pageId: string;
  error: string;
}

export interface ImportResult {
  journalId: string;
  title: string;
  attachmentErrors?: AttachmentError[];
  skippedAttachments?: string[];
}

export interface ImportInfo {
  manifest: ExportManifest;
  /** Password is required (encrypted ZIP — can't read without it). */
  needsPassword: boolean;
  /** Password is optional for a secure-but-unencrypted backup. */
  canProvidePassword: boolean;
  /** Native source size/mtime proof used to reject a changed picker selection. */
  sourceFingerprint?: string;
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'preparing' | 'pages' | 'attachments' | 'finalizing';
}
