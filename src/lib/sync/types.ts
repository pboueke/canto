import type { Attachment, SyncProvider } from 'canto-data';

export type { SyncProvider };

export interface RemoteJournalMeta {
  id: string;
  title: string;
  lastModified: number; // unix timestamp ms
  salt?: string; // base64 encoded salt for encrypted journals
  kdfIterations?: number; // PBKDF2 iterations used to derive the sync key
  encrypted?: boolean; // true if the journal is password-protected
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
  kdfIterations?: number;
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

  /**
   * Resolve exact remote IDs for chunk generations this sync will upload, so
   * bounded chunk transfers do not perform one Drive search per chunk.
   */
  prepareAttachmentChunkUploads?(
    journalId: string,
    attachments: Attachment[],
    signal?: AbortSignal,
  ): Promise<void>;

  /**
   * List the persisted indexes for one immutable attachment generation. This
   * must not read local attachment data; resumable web sync uses it to skip
   * completed chunks before IndexedDB or WebCrypto work begins.
   */
  listAttachmentChunkIndexes?(
    journalId: string,
    attachmentId: string,
    generation: string,
    chunkCount: number,
    signal?: AbortSignal,
  ): Promise<ReadonlySet<number>>;

  /** Additive bounded-payload transfer surface for canto-chunked-v1 attachments. */
  uploadAttachmentChunk?(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
    data: string,
    signal?: AbortSignal,
  ): Promise<void>;
  downloadAttachmentChunk?(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
    signal?: AbortSignal,
  ): Promise<string | null>;
  /** Remove one unreferenced chunk after a failed upload or committed generation replacement. */
  deleteAttachmentChunk?(
    journalId: string,
    attachmentId: string,
    generation: string | undefined,
    index: number,
  ): Promise<void>;
  /** Remove every old generation for an attachment after its replacement page publishes. */
  deleteAttachmentGenerationsExcept?(
    journalId: string,
    attachmentId: string,
    generation: string,
  ): Promise<void>;

  /** Delete a journal and all its contents from the remote. */
  deleteJournal(journalId: string): Promise<void>;
}

export interface DownloadFailure {
  name: string;
  reason: string;
}

export interface SyncWarning {
  pageId: string;
  name: string;
  size?: number;
  reason: 'legacy-attachment-too-large' | 'chunk-generation-missing';
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
  /** Attachments intentionally left dirty rather than risking legacy OOM. */
  warnings: SyncWarning[];
  /**
   * Web-only safety stop. The current renderer must be closed before another
   * sync resumes its immutable, unindexed attachment generations.
   */
  checkpointed?: boolean;
}
