import type { JournalContent, Page } from '@/models';

export interface RemoteJournalMeta {
  id: string;
  title: string;
  lastModified: number; // unix timestamp ms
  salt?: string; // base64 encoded salt for encrypted journals
}

export interface RemoteStore {
  /** Establish connection to the remote provider. */
  connect(credentials: unknown): Promise<void>;

  /** Disconnect from the remote provider. */
  disconnect(): Promise<void>;

  /** Check if currently connected. */
  isConnected(): boolean;

  /** List all journals available on the remote. */
  listRemoteJournals(): Promise<RemoteJournalMeta[]>;

  /** Upload journal metadata (not pages). */
  uploadJournalMeta(journal: JournalContent): Promise<void>;

  /** Download journal metadata from remote. */
  downloadJournalMeta(journalId: string): Promise<JournalContent | null>;

  /** Upload a single page. Data should already be encrypted. */
  uploadPage(journalId: string, page: Page): Promise<void>;

  /** Download a single page from remote. */
  downloadPage(journalId: string, pageId: string): Promise<Page | null>;

  /** Delete a page on the remote. */
  deletePage(journalId: string, pageId: string): Promise<void>;

  /** Upload an attachment. Returns the remote path/identifier. */
  uploadAttachment(journalId: string, localPath: string, data: string): Promise<string>;

  /** Download an attachment from remote. Returns base64 data. */
  downloadAttachment(remotePath: string): Promise<string | null>;

  /** Delete an attachment on the remote. */
  deleteAttachment(remotePath: string): Promise<void>;
}

export interface SyncConflict {
  journalId: string;
  pageId: string;
  localModified: number;
  remoteModified: number;
}

export interface SyncResult {
  uploaded: string[]; // page IDs
  downloaded: string[]; // page IDs
  deleted: string[]; // page IDs
  conflicts: SyncConflict[];
}
