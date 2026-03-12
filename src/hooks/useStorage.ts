import { useState, useEffect, useCallback } from 'react';
import type { Journal, JournalContent, Page } from '@/models';
import { createEncryptionService } from '@/lib/encryption';
import { createLocalStore } from '@/lib/storage';
import type { LocalStore } from '@/lib/storage';

let storeInstance: LocalStore | null = null;
let initialized = false;

function getStore(): LocalStore {
  if (!storeInstance) {
    const encryption = createEncryptionService();
    storeInstance = createLocalStore(encryption);
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

export function useJournal(id: string | undefined) {
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
      const result = await store.getJournal(id);
      setJournal(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return { journal, loading, error, refresh: load };
}

export function usePage(journalId: string | undefined, pageId: string | undefined) {
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
      const result = await store.getPage(journalId, pageId);
      setPage(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [journalId, pageId]);

  useEffect(() => {
    load();
  }, [load]);

  return { page, loading, error, refresh: load };
}

export function useSavePage(journalId: string | undefined) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const save = useCallback(
    async (page: Page) => {
      if (!journalId) return;

      try {
        setSaving(true);
        const store = await ensureInitialized();
        await store.savePage(journalId, page);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [journalId],
  );

  return { save, saving, error };
}
