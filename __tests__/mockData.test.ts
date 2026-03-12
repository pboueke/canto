import { mockJournals, mockPages, getJournal, getJournalPages, getPage } from '../src/lib/mockData';

describe('Mock Data', () => {
  it('has mock journals', () => {
    expect(mockJournals.length).toBeGreaterThan(0);
  });

  it('has mock pages', () => {
    expect(mockPages.length).toBeGreaterThan(0);
  });

  it('every page belongs to an existing journal', () => {
    for (const page of mockPages) {
      const journal = getJournal(page.journalId);
      expect(journal).toBeDefined();
    }
  });

  it('getJournalPages returns correct pages', () => {
    const pages = getJournalPages('journal-1');
    expect(pages.length).toBe(3);
    for (const page of pages) {
      expect(page.journalId).toBe('journal-1');
    }
  });

  it('getPage returns correct page', () => {
    const page = getPage('page-1');
    expect(page).toBeDefined();
    expect(page?.id).toBe('page-1');
  });

  it('getPage returns undefined for unknown id', () => {
    expect(getPage('unknown')).toBeUndefined();
  });

  it('getJournal returns undefined for unknown id', () => {
    expect(getJournal('unknown')).toBeUndefined();
  });
});
