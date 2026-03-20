import { pageToPreview, DEFAULT_JOURNAL_SETTINGS } from '../types';
import type { Page } from '../types';

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    text: 'First line\nSecond line\nThird line',
    date: '2026-03-12T10:00:00Z',
    tags: ['test', 'demo'],
    files: [],
    images: [],
    comments: [],
    modified: Date.now(),
    deleted: false,
    ...overrides,
  };
}

describe('pageToPreview', () => {
  it('extracts first non-empty line as preview text', () => {
    const preview = pageToPreview(makePage());
    expect(preview.previewText).toBe('First line');
  });

  it('skips leading empty lines', () => {
    const preview = pageToPreview(makePage({ text: '\n\n  \nActual first line\nMore' }));
    expect(preview.previewText).toBe('Actual first line');
  });

  it('truncates preview to 120 characters', () => {
    const longLine = 'x'.repeat(200);
    const preview = pageToPreview(makePage({ text: longLine }));
    expect(preview.previewText.length).toBe(120);
  });

  it('handles empty text', () => {
    const preview = pageToPreview(makePage({ text: '' }));
    expect(preview.previewText).toBe('');
  });

  it('sets hasImage when images array is non-empty', () => {
    const preview = pageToPreview(
      makePage({
        images: [
          {
            id: 'img-1',
            path: '/img.jpg',
            name: 'img.jpg',
            type: 'image',
            encrypted: false,
            deleted: false,
          },
        ],
      }),
    );
    expect(preview.hasImage).toBe(true);
  });

  it('sets hasAttachment when files array is non-empty', () => {
    const preview = pageToPreview(
      makePage({
        files: [
          {
            id: 'fl-1',
            path: '/doc.pdf',
            name: 'doc.pdf',
            type: 'file',
            encrypted: false,
            deleted: false,
          },
        ],
      }),
    );
    expect(preview.hasAttachment).toBe(true);
  });

  it('sets hasLocation when location is present', () => {
    const preview = pageToPreview(makePage({ location: { latitude: 40.7, longitude: -74.0 } }));
    expect(preview.hasLocation).toBe(true);
  });

  it('sets hasComments when comments array is non-empty', () => {
    const preview = pageToPreview(
      makePage({
        comments: [{ id: 'c1', text: 'Nice!', date: '2026-03-12T10:00:00Z' }],
      }),
    );
    expect(preview.hasComments).toBe(true);
  });

  it('sets hasComments to false when comments array is empty', () => {
    const preview = pageToPreview(makePage());
    expect(preview.hasComments).toBe(false);
  });

  it('carries thumbnail field through to preview', () => {
    const preview = pageToPreview(makePage({ thumbnail: 'base64data' }));
    expect(preview.thumbnail).toBe('base64data');
  });

  it('leaves thumbnail undefined when page has none', () => {
    const preview = pageToPreview(makePage());
    expect(preview.thumbnail).toBeUndefined();
  });

  it('builds searchText from lowercased text and tags', () => {
    const preview = pageToPreview(makePage({ text: 'Hello World', tags: ['Travel', 'Fun'] }));
    expect(preview.searchText).toBe('hello world travel fun');
  });

  it('searchText contains full page text, not just preview line', () => {
    const preview = pageToPreview(
      makePage({ text: 'First line\nSecond line with details\nThird', tags: [] }),
    );
    expect(preview.searchText).toContain('second line with details');
    expect(preview.searchText).toContain('third');
  });

  it('searchText includes tags at the end', () => {
    const preview = pageToPreview(makePage({ text: 'Note', tags: ['Cooking', 'Baking'] }));
    expect(preview.searchText).toBe('note cooking baking');
  });

  it('returns firstImage from first non-encrypted, non-deleted image', () => {
    const preview = pageToPreview(
      makePage({
        images: [
          {
            id: 'img-1',
            path: '/enc.jpg',
            name: 'enc.jpg',
            type: 'image',
            encrypted: true,
            deleted: false,
          },
          {
            id: 'img-2',
            path: '/plain.jpg',
            name: 'plain.jpg',
            type: 'image',
            encrypted: false,
            deleted: false,
          },
        ],
      }),
    );
    expect(preview.firstImage).toBe('/plain.jpg');
  });
});

describe('DEFAULT_JOURNAL_SETTINGS', () => {
  it('has expected default sort order', () => {
    expect(DEFAULT_JOURNAL_SETTINGS.sort).toBe('descending');
  });

  it('has previewTags enabled by default', () => {
    expect(DEFAULT_JOURNAL_SETTINGS.previewTags).toBe(true);
  });

  it('has autoLocation disabled by default', () => {
    expect(DEFAULT_JOURNAL_SETTINGS.autoLocation).toBe(false);
  });

  it('has remoteSync disabled by default', () => {
    expect(DEFAULT_JOURNAL_SETTINGS.remoteSync).toBe(false);
  });
});
