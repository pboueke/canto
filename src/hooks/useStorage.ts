import { useState, useEffect, useCallback } from 'react';
import type { Journal, JournalContent, Page } from '@/models';
import { DEFAULT_JOURNAL_SETTINGS } from '@/models';
import { createEncryptionService } from '@/lib/encryption';
import { createLocalStore } from '@/lib/storage';
import type { LocalStore } from '@/lib/storage';

function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let storeInstance: LocalStore | null = null;
let encryptionInstance: ReturnType<typeof createEncryptionService> | null = null;
let initialized = false;

function getStore(): LocalStore {
  if (!storeInstance) {
    encryptionInstance = createEncryptionService();
    storeInstance = createLocalStore(encryptionInstance);
  }
  return storeInstance;
}

async function ensureInitialized(): Promise<LocalStore> {
  const store = getStore();
  if (!initialized) {
    await store.initialize();
    initialized = true;
  }
  return store;
}

export function getEncryptionService() {
  getStore(); // ensure encryptionInstance is created
  return encryptionInstance!;
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface CreateJournalInput {
  title: string;
  icon: string;
  password?: string;
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
      ) => Promise<Uint8Array>,
    ): Promise<string> => {
      try {
        setCreating(true);
        const store = await ensureInitialized();
        const encryption = getEncryptionService();
        const journalId = generateUUID();
        const now = new Date().toISOString();
        const hasPassword = !!input.password;

        let salt: string | undefined;
        let derivedKey: Uint8Array | undefined;

        if (hasPassword && input.password) {
          const saltBytes = encryption.generateSalt();
          salt = uint8ToBase64(saltBytes);
          if (deriveAndCache) {
            derivedKey = await deriveAndCache(journalId, input.password, salt);
          }
        }

        const welcomePage: Page = {
          id: generateUUID(),
          text: '# Welcome\n\nThis is your first entry. Start writing!',
          date: now,
          tags: [],
          files: [],
          images: [],
          comments: [],
          modified: Date.now(),
          deleted: false,
        };

        const journal: JournalContent = {
          id: journalId,
          title: input.title,
          icon: input.icon,
          date: now,
          secure: hasPassword,
          salt,
          pages: [welcomePage],
          settings: { ...DEFAULT_JOURNAL_SETTINGS },
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
