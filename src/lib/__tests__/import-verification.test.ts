import type { JournalContent } from 'canto-data';
import { DEFAULT_JOURNAL_SETTINGS } from 'canto-data';
import { verifyImportedJournal } from '../backup/import-verification';
import type { LocalStore } from '../storage';

const journal = (): JournalContent => ({
  id: 'j1',
  title: 'Imported',
  icon: 'book',
  date: '2026-01-01',
  secure: false,
  salt: 'salt',
  pages: [],
  settings: { ...DEFAULT_JOURNAL_SETTINGS },
  version: 1,
});

describe('verifyImportedJournal', () => {
  it('uses the bounded overview path when available', async () => {
    const source = journal();
    const { pages, ...metadata } = source;
    const store = {
      getJournalOverview: jest
        .fn()
        .mockResolvedValue({ metadata, pages, tags: [], latestModified: 0 }),
      getJournal: jest.fn(),
    } as unknown as LocalStore;
    await expect(verifyImportedJournal(store, source)).resolves.toBeUndefined();
    expect(store.getJournal).not.toHaveBeenCalled();
  });

  it('supports older stores and rejects missing or mismatched persisted data', async () => {
    const source = journal();
    const getJournal = jest.fn().mockResolvedValue(source);
    const store = { getJournal } as unknown as LocalStore;
    await expect(verifyImportedJournal(store, source)).resolves.toBeUndefined();
    getJournal.mockResolvedValueOnce(null);
    await expect(verifyImportedJournal(store, source)).rejects.toThrow(
      'saved journal did not match',
    );
    getJournal.mockResolvedValueOnce({ ...source, title: 'Other' });
    await expect(verifyImportedJournal(store, source)).rejects.toThrow(
      'saved journal did not match',
    );
  });
});
