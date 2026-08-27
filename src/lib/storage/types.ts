import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { JournalOverview } from '@/lib/journal-overview';

export interface ReencryptionSkippedAttachment {
  name: string;
  size?: number;
}

export interface ReencryptionResult {
  skippedAttachments: ReencryptionSkippedAttachment[];
}

/** Progress emitted only while a legacy journal is rebuilding its page catalog. */
export interface JournalOverviewReadOptions {
  onRebuildProgress?: (progress: { current: number; total: number }) => void;
  /** Checked between page reads and before catalog publication. */
  signal?: AbortSignal;
}

/**
 * Compact, immutable local view used to plan sync work. Page records remain
 * authoritative and are loaded individually through getPage when needed.
 */
export interface JournalSyncSnapshot {
  metadata: Omit<JournalContent, 'pages'>;
  pages: ReadonlyMap<string, { modified: number; deleted?: boolean }>;
}

/**
 * Keyless evidence recorded with an in-progress import. It lets startup verify
 * a completed, non-password-protected content root before replaying the final
 * journal-index publication.
 */
export interface JournalImportRecoveryInfo {
  expectedPageCount: number;
}

/**
 * Metadata-only result for a legacy attachment. `unknown` must not be resolved
 * by reading the payload, because that would defeat the sync memory guard.
 */
export type AttachmentStorageSize =
  | { status: 'known'; bytes: number }
  | { status: 'missing' }
  | { status: 'unknown' };

export interface LocalStore {
  /** Initialize storage directories. Must be called before other operations. */
  initialize(): Promise<void>;

  /** List all journals (metadata only, no pages). */
  listJournals(): Promise<Journal[]>;

  /** Get full journal content including pages. derivedKey for password-protected journals. */
  getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null>;

  /** Read encrypted metadata plus the rebuildable preview catalog without opening page files. */
  getJournalOverview?(
    id: string,
    derivedKey?: Uint8Array,
    options?: JournalOverviewReadOptions,
  ): Promise<JournalOverview | null>;

  /**
   * Read encrypted metadata plus the validated page catalog without opening
   * local page JSON records. Missing or invalid catalogs rebuild internally.
   */
  getJournalSyncSnapshot?(id: string, derivedKey?: Uint8Array): Promise<JournalSyncSnapshot | null>;

  /** Save or update journal metadata and settings. derivedKey for password-protected journals. */
  saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void>;

  /** Update journal fields/settings without opening or rewriting any page file. */
  saveJournalMetadata?(
    metadata: Omit<JournalContent, 'pages'>,
    derivedKey?: Uint8Array,
  ): Promise<void>;

  /**
   * Keep a new-journal import invisible until metadata, pages, catalog, and
   * index have all been committed. Startup rolls back an unfinished import.
   */
  beginJournalImport?(id: string): Promise<void>;
  updateJournalImport?(
    id: string,
    phase: 'writing' | 'publishing' | 'committed',
    recovery?: JournalImportRecoveryInfo,
  ): Promise<void>;
  completeJournalImport?(id: string): Promise<void>;
  abortJournalImport?(id: string): Promise<void>;

  /** Delete a journal and all its contents. */
  deleteJournal(id: string): Promise<void>;

  /** Get a single page from a journal. derivedKey for password-protected journals. */
  getPage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<Page | null>;

  /** Save or update a page in a journal. derivedKey for password-protected journals.
   *  When preserveModified is true, the page's existing modified timestamp is kept
   *  (used by sync to preserve remote timestamps on download). */
  savePage(
    journalId: string,
    page: Page,
    derivedKey?: Uint8Array,
    preserveModified?: boolean,
  ): Promise<void>;

  /** Soft-delete a page (marks as deleted for sync). derivedKey for password-protected journals. */
  deletePage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<void>;

  /** Save an attachment file and return its storage path. derivedKey for encrypted attachments. */
  saveAttachment(
    journalId: string,
    pageId: string,
    attachment: Attachment,
    data: string, // base64 encoded
    derivedKey?: Uint8Array,
  ): Promise<string>;

  /**
   * Persist newly ingested chunked content from bounded byte chunks. Base64
   * saveAttachment remains only for legacy callers and flat ZIP import.
   */
  saveAttachmentStream?(
    journalId: string,
    pageId: string,
    attachment: Attachment,
    chunks: AsyncIterable<Uint8Array>,
    derivedKey?: Uint8Array,
  ): Promise<string>;

  /** Read an attachment file as base64. derivedKey for encrypted attachments. */
  getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null>;

  /** Delete an attachment file or chunk root from storage. */
  deleteAttachment(path: string): Promise<void>;

  /**
   * Visit a chunked attachment after removing only its device layer. The values
   * intentionally remain password-encrypted when applicable, exactly like
   * getAttachment(path) without a derived key, so sync never handles a full
   * attachment or a journal password key.
   */
  forEachAttachmentChunk?(
    attachment: Attachment,
    visitor: (index: number, data: string) => Promise<void>,
    /** When supplied, skip every other index before reading or decrypting it. */
    indexes?: ReadonlySet<number>,
  ): Promise<void>;

  /**
   * Visit display bytes one decoded base64 chunk at a time. Unlike the sync
   * visitor, this removes both device and (when supplied) password layers, but
   * never assembles the attachment into one JS value.
   */
  forEachAttachmentDisplayChunk?(
    attachment: Attachment,
    visitor: (index: number, base64: string) => Promise<void>,
    derivedKey?: Uint8Array,
  ): Promise<void>;

  /** Write sync-decrypted chunk values without reassembling the attachment. */
  saveAttachmentChunks?(
    journalId: string,
    pageId: string,
    attachment: Attachment,
    chunks: AsyncIterable<string>,
  ): Promise<string>;

  /**
   * Report attachment existence and stored bytes without reading/decrypting its
   * payload. Missing and unknown are intentionally distinct: sync may retain
   * its historical missing-file behavior, but must defer unknown legacy data.
   */
  getAttachmentStorageSize?(path: string): Promise<AttachmentStorageSize>;

  /**
   * Re-encrypt journal data with a new key.
   * On web, oversized attachments may remain device-encrypted but outside the journal password layer.
   */
  reencryptJournal(
    journal: JournalContent,
    oldKey: Uint8Array | undefined,
    newKey: Uint8Array | undefined,
    onProgress?: (current: number, total: number) => void,
  ): Promise<ReencryptionResult>;

  /**
   * True only after a device-key data transaction has crossed its durable commit
   * point. Startup uses this proof before discarding the previous device key.
   */
  hasCompletedDeviceKeyRotation?(): Promise<boolean>;

  /** Remove the durable completion proof after the previous device key is discarded. */
  clearCompletedDeviceKeyRotation?(): Promise<void>;

  /** Re-encrypt all data with a new device key (for device key rotation). */
  reencryptAll(
    oldDeviceEncrypt: (plaintext: string) => Promise<string>,
    oldDeviceDecrypt: (ciphertext: string) => Promise<string>,
    newDeviceEncrypt: (plaintext: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void>;
}
