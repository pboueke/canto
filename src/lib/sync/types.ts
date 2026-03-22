import type { SyncProvider } from 'canto-data';

export type { SyncProvider };

export interface RemoteJournalMeta {
  id: string;
  title: string;
  lastModified: number; // unix timestamp ms
  salt?: string; // base64 encoded salt for encrypted journals
}

/** Lightweight sync index — stored unencrypted on remote for O(1) timestamp comparison. */
export interface SyncIndex {
  [pageId: string]: { modified: number; deleted?: boolean };
}

/** Registry metadata passed alongside encrypted journal content. */
export interface RegistryInfo {
  title: string;
  encrypted: boolean;
  salt?: string;
}

export interface RemoteStore {
  /** The provider identifier for this store. */
  readonly provider: SyncProvider;

  /** Establish connection to the remote provider. */
  connect(credentials: unknown): Promise<void>;

  /** Disconnect from the remote provider. */
  disconnect(): Promise<void>;

  /** Check if currently connected. */
  isConnected(): boolean;

  /** Check if a path is a remote path belonging to this provider. */
  isRemotePath(path: string): boolean;

  /** Build a remote attachment path for a journal and filename. */
  buildRemotePath(journalId: string, filename: string): string;

  /** List all journals available on the remote. */
  listRemoteJournals(): Promise<RemoteJournalMeta[]>;

  /** Upload encrypted journal metadata + update registry. */
  uploadJournalMeta(
    journalId: string,
    encryptedMeta: string,
    registry: RegistryInfo,
  ): Promise<void>;

  /** Download raw (encrypted) journal metadata string from remote. */
  downloadJournalMeta(journalId: string): Promise<string | null>;

  /** Upload an encrypted page blob. */
  uploadPage(journalId: string, pageId: string, encryptedContent: string): Promise<void>;

  /** Download raw (encrypted) page content from remote. */
  downloadPage(journalId: string, pageId: string): Promise<string | null>;

  /** Delete a page on the remote. */
  deletePage(journalId: string, pageId: string): Promise<void>;

  /** Upload the sync timestamp index for a journal. */
  uploadSyncIndex(journalId: string, index: SyncIndex): Promise<void>;

  /** Download the sync timestamp index for a journal. */
  downloadSyncIndex(journalId: string): Promise<SyncIndex | null>;

  /** Upload an attachment. Returns the remote path/identifier. */
  uploadAttachment(journalId: string, localPath: string, data: string): Promise<string>;

  /** Download an attachment from remote. Returns base64 data. */
  downloadAttachment(remotePath: string): Promise<string | null>;

  /** Delete an attachment on the remote. */
  deleteAttachment(remotePath: string): Promise<void>;

  /** Delete a journal and all its contents from the remote. */
  deleteJournal(journalId: string): Promise<void>;
}

export interface DownloadFailure {
  name: string;
  reason: string;
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
