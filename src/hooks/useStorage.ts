import { useState, useEffect, useCallback, useRef } from 'react';
import type { Journal, JournalContent, Page, Attachment } from 'canto-data';
import type { JournalOverview } from '@/lib/journal-overview';
import { DEFAULT_JOURNAL_SETTINGS, SCHEMA_VERSION } from 'canto-data';
import { createEncryptionService } from '@/lib/encryption';
import { recoverKeyRotation } from '@/lib/encryption/device';
import { createLocalStore } from '@/lib/storage';
import type { LocalStore } from '@/lib/storage';
import { generateUUID, uint8ToBase64 } from '@/lib/encryption/utils';
import {
  materializeAttachmentDisplay,
  type AttachmentDisplayLease,
} from '@/lib/attachment-display';

let storeInstance: LocalStore | null = null;
let encryptionInstance: ReturnType<typeof createEncryptionService> | null = null;
let initPromise: Promise<LocalStore> | null = null;
const journalOverviewListeners = new Map<string, Set<() => void>>();
const journalOverviewRequests = new Map<string, Promise<JournalOverview | null>>();

export type JournalOverviewStatus = 'initial' | 'migrating' | 'ready' | 'error';
export interface JournalOverviewMigrationProgress {
  current: number;
  total: number;
}

/** Notify active overview readers after a committed journal mutation. */
export function invalidateJournalOverview(journalId: string): void {
  for (const listener of journalOverviewListeners.get(journalId) ?? []) listener();
}

function subscribeToJournalOverview(journalId: string, listener: () => void): () => void {
  const listeners = journalOverviewListeners.get(journalId) ?? new Set<() => void>();
  listeners.add(listener);
  journalOverviewListeners.set(journalId, listeners);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) journalOverviewListeners.delete(journalId);
  };
}

function getStore(): LocalStore {
  if (!storeInstance) {
    encryptionInstance = createEncryptionService();
    storeInstance = createLocalStore(encryptionInstance);
  }
  return storeInstance;
}

/** Resolve an interrupted device-key rotation before later writes can replace its fallback. */
export async function finalizeCompletedDeviceKeyRotationIfReady(store: LocalStore): Promise<void> {
  const completed =
    !!store.hasCompletedDeviceKeyRotation && (await store.hasCompletedDeviceKeyRotation());
  await recoverKeyRotation(completed);
  if (completed) await store.clearCompletedDeviceKeyRotation?.();
}

async function ensureInitialized(): Promise<LocalStore> {
  const store = getStore();
  if (!initPromise) {
    initPromise = store
      .initialize()
      .then(async () => {
        // LocalStore writes this marker in the same durable transaction as
        // all re-encrypted data. Only then is it safe to discard the previous
        // device key; a crash during either cleanup step is retried on startup.
        await finalizeCompletedDeviceKeyRotationIfReady(store);
        return store;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

function journalOverviewRequestKey(id: string, derivedKey?: Uint8Array | null): string {
  return `${id}:${derivedKey ? uint8ToBase64(derivedKey) : 'device'}`;
}

async function loadJournalOverview(
  id: string,
  derivedKey?: Uint8Array | null,
  force = false,
  onRebuildProgress?: (progress: JournalOverviewMigrationProgress) => void,
): Promise<JournalOverview | null> {
  const key = journalOverviewRequestKey(id, derivedKey);
  const existing = journalOverviewRequests.get(key);
  if (existing && !force) return existing;

  const request = (async () => {
    const store = await ensureInitialized();
    if (!store.getJournalOverview) {
      throw new Error('Local storage does not support journal overview reads');
    }
    return store.getJournalOverview(id, derivedKey ?? undefined, { onRebuildProgress });
  })();
  journalOverviewRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (journalOverviewRequests.get(key) === request) journalOverviewRequests.delete(key);
  }
}

export function getEncryptionService() {
  getStore(); // ensure encryptionInstance is created
  return encryptionInstance!;
}

export async function getLocalStore(): Promise<LocalStore> {
  return ensureInitialized();
}

export async function tryLoadJournal(
  id: string,
  derivedKey?: Uint8Array,
): Promise<JournalContent | null> {
  const store = await ensureInitialized();
  return store.getJournal(id, derivedKey);
}

/**
 * Verify access and obtain the list-ready journal projection without decrypting
 * every page. This is the bounded path for opening password-protected journals.
 */
export async function tryLoadJournalOverview(
  id: string,
  derivedKey?: Uint8Array,
): Promise<JournalOverview | null> {
  return loadJournalOverview(id, derivedKey);
}

export function useJournals() {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const store = await ensureInitialized();
      const result = await store.listJournals();
      setJournals(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { journals, loading, error, refresh: load };
}

export function useJournal(id: string | undefined, derivedKey?: Uint8Array | null) {
  const [journal, setJournal] = useState<JournalContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setJournal(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const store = await ensureInitialized();
      const result = await store.getJournal(id, derivedKey ?? undefined);
      setJournal(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [id, derivedKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { journal, loading, error, refresh: load };
}

/** Read-oriented journal views use the encrypted preview catalog, not every page file. */
export function useJournalOverview(id: string | undefined, derivedKey?: Uint8Array | null) {
  const [overview, setOverview] = useState<JournalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<JournalOverviewStatus>('initial');
  const [migrationProgress, setMigrationProgress] =
    useState<JournalOverviewMigrationProgress | null>(null);
  const requestVersionRef = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const requestVersion = ++requestVersionRef.current;
      if (!id) {
        if (requestVersion === requestVersionRef.current) {
          setOverview(null);
          setLoading(false);
          setStatus('ready');
          setMigrationProgress(null);
        }
        return null;
      }

      try {
        setLoading(true);
        setStatus('initial');
        setMigrationProgress(null);
        const result = await loadJournalOverview(id, derivedKey, force, (progress) => {
          if (requestVersion === requestVersionRef.current) {
            setStatus('migrating');
            setMigrationProgress(progress);
          }
        });
        if (requestVersion === requestVersionRef.current) {
          setOverview(result);
          setError(null);
          setStatus('ready');
          setMigrationProgress(null);
        }
        return result;
      } catch (err) {
        if (requestVersion === requestVersionRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setStatus('error');
        }
        return null;
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false);
      }
    },
    [id, derivedKey],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return subscribeToJournalOverview(id, () => {
      void load(true);
    });
  }, [id, load]);

  const refresh = useCallback(() => load(true), [load]);

  return { overview, loading, error, status, migrationProgress, refresh };
}

export function usePage(
  journalId: string | undefined,
  pageId: string | undefined,
  derivedKey?: Uint8Array | null,
) {
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    if (!journalId || !pageId) {
      setPage(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const store = await ensureInitialized();
      const result = await store.getPage(journalId, pageId, derivedKey ?? undefined);
      setPage(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [journalId, pageId, derivedKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { page, loading, error, refresh: load };
}

export function useSavePage(journalId: string | undefined, derivedKey?: Uint8Array | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const save = useCallback(
    async (page: Page) => {
      if (!journalId) return;

      try {
        setSaving(true);
        const store = await ensureInitialized();
        await store.savePage(journalId, page, derivedKey ?? undefined);
        invalidateJournalOverview(journalId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [journalId, derivedKey],
  );

  return { save, saving, error };
}

interface CreateJournalInput {
  title: string;
  icon: string;
  password?: string;
  biometric?: boolean;
  themeOverride?: string;
  kdfIterations?: number;
}

export function useCreateJournal() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(
    async (
      input: CreateJournalInput,
      deriveAndCache?: (
        journalId: string,
        password: string,
        saltBase64: string,
        iterations?: number,
      ) => Promise<Uint8Array>,
    ): Promise<string> => {
      try {
        setCreating(true);
        const store = await ensureInitialized();
        const encryption = getEncryptionService();
        const journalId = generateUUID();
        const now = new Date().toISOString();
        const hasPassword = !!input.password;

        const saltBytes = encryption.generateSalt();
        const salt = uint8ToBase64(saltBytes);
        let derivedKey: Uint8Array | undefined;
        if (deriveAndCache) {
          derivedKey = await deriveAndCache(
            journalId,
            input.password || '',
            salt,
            input.kdfIterations,
          );
        }

        const journal: JournalContent = {
          id: journalId,
          title: input.title,
          icon: input.icon,
          date: now,
          secure: hasPassword,
          salt,
          biometric: input.biometric || undefined,
          kdfIterations: input.kdfIterations,
          pages: [],
          settings: { ...DEFAULT_JOURNAL_SETTINGS, themeOverride: input.themeOverride },
          schemaVersion: SCHEMA_VERSION,
          version: 1,
        };

        await store.saveJournal(journal, derivedKey);
        setError(null);
        return journalId;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  return { create, creating, error };
}

export function useCreatePage(journalId: string | undefined, derivedKey?: Uint8Array | null) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const create = useCallback(async (): Promise<string | null> => {
    if (!journalId) return null;

    try {
      setCreating(true);
      const store = await ensureInitialized();
      const pageId = generateUUID();
      const now = new Date().toISOString();

      const page: Page = {
        id: pageId,
        text: '',
        date: now,
        tags: [],
        files: [],
        images: [],
        comments: [],
        modified: Date.now(),
        deleted: false,
      };

      await store.savePage(journalId, page, derivedKey ?? undefined);
      invalidateJournalOverview(journalId);
      setError(null);
      return pageId;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [journalId, derivedKey]);

  return { create, creating, error };
}

export function useDeletePage(journalId: string | undefined, derivedKey?: Uint8Array | null) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deletePage = useCallback(
    async (pageId: string) => {
      if (!journalId) return;

      try {
        setDeleting(true);
        const store = await ensureInitialized();
        await store.deletePage(journalId, pageId, derivedKey ?? undefined);
        invalidateJournalOverview(journalId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setDeleting(false);
      }
    },
    [journalId, derivedKey],
  );

  return { deletePage, deleting, error };
}

export function useJournalTags(journalId: string | undefined, derivedKey?: Uint8Array | null) {
  const { overview, loading, error, refresh } = useJournalOverview(journalId, derivedKey);
  return { tags: overview?.tags ?? [], loading, error, refresh };
}

export function useDeleteJournal() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteJournal = useCallback(async (id: string) => {
    try {
      setDeleting(true);
      const store = await ensureInitialized();
      await store.deleteJournal(id);
      invalidateJournalOverview(id);
      setError(null);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleteJournal, deleting, error };
}

export function useSaveJournal() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const saveJournal = useCallback(async (journal: JournalContent, derivedKey?: Uint8Array) => {
    try {
      setSaving(true);
      const store = await ensureInitialized();
      await store.saveJournal(journal, derivedKey);
      invalidateJournalOverview(journal.id);
      setError(null);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const saveJournalMetadata = useCallback(
    async (metadata: Omit<JournalContent, 'pages'>, derivedKey?: Uint8Array) => {
      try {
        setSaving(true);
        const store = await ensureInitialized();
        if (store.saveJournalMetadata) {
          await store.saveJournalMetadata(metadata, derivedKey);
        } else {
          // Older adapters only expose the heavyweight write. Preserve their
          // existing page files rather than treating metadata-only callers as
          // an empty journal update.
          const journal = await store.getJournal(metadata.id, derivedKey);
          if (!journal) throw new Error(`Journal not found: ${metadata.id}`);
          await store.saveJournal({ ...metadata, pages: journal.pages }, derivedKey);
        }
        invalidateJournalOverview(metadata.id);
        setError(null);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { saveJournal, saveJournalMetadata, saving, error };
}

export function useAttachment(derivedKey?: Uint8Array | null) {
  const saveAttachment = useCallback(
    async (
      journalId: string,
      pageId: string,
      attachment: Attachment,
      data: string,
    ): Promise<string> => {
      const store = await ensureInitialized();
      return store.saveAttachment(
        journalId,
        pageId,
        attachment,
        data,
        attachment.encrypted ? (derivedKey ?? undefined) : undefined,
      );
    },
    [derivedKey],
  );

  const saveAttachmentStream = useCallback(
    async (
      journalId: string,
      pageId: string,
      attachment: Attachment,
      chunks: AsyncIterable<Uint8Array>,
    ): Promise<string> => {
      const store = await ensureInitialized();
      if (!store.saveAttachmentStream) {
        throw new Error('Chunked attachment ingestion is unavailable');
      }
      return store.saveAttachmentStream(
        journalId,
        pageId,
        attachment,
        chunks,
        attachment.encrypted ? (derivedKey ?? undefined) : undefined,
      );
    },
    [derivedKey],
  );

  const getAttachment = useCallback(
    async (path: string, encrypted: boolean): Promise<string | null> => {
      const store = await ensureInitialized();
      return store.getAttachment(path, encrypted ? (derivedKey ?? undefined) : undefined);
    },
    [derivedKey],
  );

  const deleteAttachment = useCallback(async (path: string): Promise<void> => {
    const store = await ensureInitialized();
    return store.deleteAttachment(path);
  }, []);

  const materializeImage = useCallback(
    async (attachment: Attachment, signal?: AbortSignal): Promise<AttachmentDisplayLease> => {
      const store = await ensureInitialized();
      return materializeAttachmentDisplay(
        store,
        attachment,
        attachment.encrypted ? (derivedKey ?? undefined) : undefined,
        signal,
      );
    },
    [derivedKey],
  );

  return {
    saveAttachment,
    saveAttachmentStream,
    getAttachment,
    deleteAttachment,
    materializeImage,
  };
}
