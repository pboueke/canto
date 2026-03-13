import type { Journal, JournalContent, Page, Attachment } from '@/models';

export interface LocalStore {
  /** Initialize storage directories. Must be called before other operations. */
  initialize(): Promise<void>;

  /** List all journals (metadata only, no pages). */
  listJournals(): Promise<Journal[]>;

  /** Get full journal content including pages. derivedKey for password-protected journals. */
  getJournal(id: string, derivedKey?: Uint8Array): Promise<JournalContent | null>;

  /** Save or update journal metadata and settings. derivedKey for password-protected journals. */
  saveJournal(journal: JournalContent, derivedKey?: Uint8Array): Promise<void>;

  /** Delete a journal and all its contents. */
  deleteJournal(id: string): Promise<void>;

  /** Get a single page from a journal. derivedKey for password-protected journals. */
  getPage(journalId: string, pageId: string, derivedKey?: Uint8Array): Promise<Page | null>;

  /** Save or update a page in a journal. derivedKey for password-protected journals. */
  savePage(journalId: string, page: Page, derivedKey?: Uint8Array): Promise<void>;

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

  /** Read an attachment file as base64. derivedKey for encrypted attachments. */
  getAttachment(path: string, derivedKey?: Uint8Array): Promise<string | null>;

  /** Delete an attachment file from storage. */
  deleteAttachment(path: string): Promise<void>;

  /** Re-encrypt all journal data atomically with a new key. */
  reencryptJournal(
    journal: JournalContent,
    oldKey: Uint8Array | undefined,
    newKey: Uint8Array | undefined,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void>;

  /** Re-encrypt all data with a new device key (for device key rotation). */
  reencryptAll(
    oldDeviceEncrypt: (plaintext: string) => Promise<string>,
    oldDeviceDecrypt: (ciphertext: string) => Promise<string>,
    newDeviceEncrypt: (plaintext: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void>;
}
