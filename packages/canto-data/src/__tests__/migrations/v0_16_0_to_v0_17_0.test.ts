import { v0_16_0_to_v0_17_0 } from '../../migrations/v0_16_0_to_v0_17_0';

/**
 * Builds a realistic v0.16.0 JournalContent object.
 * Includes the deprecated showMarkdownPlaceholder field in settings.
 */
function makeV0_16_Journal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journal-abc-123',
    title: 'My Journal',
    icon: 'book',
    date: '2026-01-15T10:00:00Z',
    secure: false,
    version: 1,
    schemaVersion: '0.16.0',
    settings: {
      use24h: false,
      previewTags: true,
      previewThumbnail: true,
      previewIcons: true,
      filterBar: true,
      sort: 'descending',
      showMarkdownPlaceholder: true,
      autoLocation: false,
      remoteSync: false,
      autoSync: false,
    },
    pages: [
      {
        id: 'page-1',
        text: 'Hello world',
        date: '2026-02-10T08:00:00Z',
        tags: ['travel'],
        files: [],
        images: [
          {
            id: 'img-1',
            path: 'attachments/img-1.jpg',
            name: 'photo.jpg',
            type: 'image',
            encrypted: false,
            size: 12345,
            deleted: false,
          },
        ],
        comments: [{ id: 'c1', text: 'nice', date: '2026-02-10T09:00:00Z' }],
        modified: 1707552000000,
        deleted: false,
      },
      {
        id: 'page-2',
        text: '# Encrypted entry\nSensitive content here',
        date: '2026-03-01T12:00:00Z',
        tags: [],
        files: [
          {
            id: 'file-1',
            path: 'attachments/file-1.pdf',
            name: 'report.pdf',
            type: 'file',
            encrypted: true,
            size: 999999,
            deleted: false,
          },
        ],
        images: [],
        comments: [],
        modified: 1709294400000,
        deleted: false,
        location: { latitude: 40.7128, longitude: -74.006 },
      },
    ],
    ...overrides,
  };
}

describe('v0_16_0_to_v0_17_0 migration', () => {
  const { migrate } = v0_16_0_to_v0_17_0;

  it('has correct from/to versions', () => {
    expect(v0_16_0_to_v0_17_0.from).toBe('0.16.0');
    expect(v0_16_0_to_v0_17_0.to).toBe('0.17.0');
  });

  // -----------------------------------------------------------------------
  // Core behavior
  // -----------------------------------------------------------------------

  it('removes showMarkdownPlaceholder from settings', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const settings = result.settings as Record<string, unknown>;
    expect(settings).not.toHaveProperty('showMarkdownPlaceholder');
  });

  it('preserves all other settings fields', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const settings = result.settings as Record<string, unknown>;
    expect(settings.use24h).toBe(false);
    expect(settings.previewTags).toBe(true);
    expect(settings.previewThumbnail).toBe(true);
    expect(settings.previewIcons).toBe(true);
    expect(settings.filterBar).toBe(true);
    expect(settings.sort).toBe('descending');
    expect(settings.autoLocation).toBe(false);
    expect(settings.remoteSync).toBe(false);
    expect(settings.autoSync).toBe(false);
  });

  it('preserves journal metadata', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    expect(result.id).toBe('journal-abc-123');
    expect(result.title).toBe('My Journal');
    expect(result.icon).toBe('book');
    expect(result.date).toBe('2026-01-15T10:00:00Z');
    expect(result.secure).toBe(false);
    expect(result.version).toBe(1);
    expect(result.schemaVersion).toBe('0.16.0');
  });

  it('preserves all pages and their content', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const pages = result.pages as Record<string, unknown>[];
    expect(pages).toHaveLength(2);
    expect(pages[0].id).toBe('page-1');
    expect(pages[0].text).toBe('Hello world');
    expect(pages[0].tags).toEqual(['travel']);
    expect(pages[1].id).toBe('page-2');
    expect(pages[1].text).toBe('# Encrypted entry\nSensitive content here');
  });

  it('preserves attachments on pages', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const pages = result.pages as Record<string, unknown>[];

    const p1Images = pages[0].images as Record<string, unknown>[];
    expect(p1Images).toHaveLength(1);
    expect(p1Images[0].id).toBe('img-1');
    expect(p1Images[0].path).toBe('attachments/img-1.jpg');
    expect(p1Images[0].encrypted).toBe(false);
    expect(p1Images[0].size).toBe(12345);

    const p2Files = pages[1].files as Record<string, unknown>[];
    expect(p2Files).toHaveLength(1);
    expect(p2Files[0].id).toBe('file-1');
    expect(p2Files[0].encrypted).toBe(true);
  });

  it('preserves comments on pages', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const pages = result.pages as Record<string, unknown>[];
    const comments = pages[0].comments as Record<string, unknown>[];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe('c1');
    expect(comments[0].text).toBe('nice');
  });

  it('preserves location data on pages', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal) as Record<string, unknown>;
    const pages = result.pages as Record<string, unknown>[];
    const loc = pages[1].location as Record<string, unknown>;
    expect(loc.latitude).toBe(40.7128);
    expect(loc.longitude).toBe(-74.006);
  });

  // -----------------------------------------------------------------------
  // Mutation safety — the migration mutates in place, verify no unintended
  // side effects on sibling data.
  // -----------------------------------------------------------------------

  it('returns the same object reference (in-place mutation)', () => {
    const journal = makeV0_16_Journal();
    const result = migrate(journal);
    expect(result).toBe(journal);
  });

  it('does not add any new fields to settings', () => {
    const journal = makeV0_16_Journal();
    const settingsBefore = Object.keys(
      (journal as Record<string, unknown>).settings as Record<string, unknown>,
    );
    migrate(journal);
    const settingsAfter = Object.keys(
      (journal as Record<string, unknown>).settings as Record<string, unknown>,
    );
    // Should have one fewer key (showMarkdownPlaceholder removed)
    expect(settingsAfter.length).toBe(settingsBefore.length - 1);
    expect(settingsAfter).not.toContain('showMarkdownPlaceholder');
  });

  it('does not modify page count', () => {
    const journal = makeV0_16_Journal();
    const pagesBefore = ((journal as Record<string, unknown>).pages as unknown[]).length;
    migrate(journal);
    const pagesAfter = ((journal as Record<string, unknown>).pages as unknown[]).length;
    expect(pagesAfter).toBe(pagesBefore);
  });

  // -----------------------------------------------------------------------
  // Edge cases — ensure no crash or corruption on unexpected input shapes
  // -----------------------------------------------------------------------

  it('handles showMarkdownPlaceholder: false', () => {
    const journal = makeV0_16_Journal();
    (
      (journal as Record<string, unknown>).settings as Record<string, unknown>
    ).showMarkdownPlaceholder = false;
    const result = migrate(journal) as Record<string, unknown>;
    const settings = result.settings as Record<string, unknown>;
    expect(settings).not.toHaveProperty('showMarkdownPlaceholder');
    expect(settings.sort).toBe('descending');
  });

  it('handles settings without showMarkdownPlaceholder (already clean)', () => {
    const journal = makeV0_16_Journal();
    delete ((journal as Record<string, unknown>).settings as Record<string, unknown>)
      .showMarkdownPlaceholder;
    const keysBefore = Object.keys(
      (journal as Record<string, unknown>).settings as Record<string, unknown>,
    ).sort();
    const result = migrate(journal) as Record<string, unknown>;
    const keysAfter = Object.keys(result.settings as Record<string, unknown>).sort();
    expect(keysAfter).toEqual(keysBefore);
  });

  it('handles data with no settings key', () => {
    const data = { id: 'test', pages: [] };
    const result = migrate(data);
    expect(result).toBe(data);
    expect((result as Record<string, unknown>).id).toBe('test');
  });

  it('handles null data', () => {
    expect(migrate(null)).toBeNull();
  });

  it('handles undefined data', () => {
    expect(migrate(undefined)).toBeUndefined();
  });

  it('handles primitive data', () => {
    expect(migrate(42)).toBe(42);
    expect(migrate('hello')).toBe('hello');
  });

  it('handles empty object', () => {
    const data = {};
    expect(migrate(data)).toBe(data);
  });

  it('handles settings that is null', () => {
    const data = { settings: null };
    const result = migrate(data);
    expect((result as Record<string, unknown>).settings).toBeNull();
  });

  it('handles settings that is a primitive', () => {
    const data = { settings: 'not-an-object' };
    const result = migrate(data);
    expect((result as Record<string, unknown>).settings).toBe('not-an-object');
  });

  it('handles settings that is an array', () => {
    const data = { settings: [1, 2, 3] };
    const result = migrate(data);
    expect((result as Record<string, unknown>).settings).toEqual([1, 2, 3]);
  });

  // -----------------------------------------------------------------------
  // Secure journal — ensure encryption-related fields survive
  // -----------------------------------------------------------------------

  it('preserves secure journal fields', () => {
    const journal = makeV0_16_Journal({
      secure: true,
      salt: 'base64salt==',
      kdfIterations: 600000,
      biometric: true,
    });
    const result = migrate(journal) as Record<string, unknown>;
    expect(result.secure).toBe(true);
    expect(result.salt).toBe('base64salt==');
    expect(result.kdfIterations).toBe(600000);
    expect(result.biometric).toBe(true);
    expect(result.settings as Record<string, unknown>).not.toHaveProperty(
      'showMarkdownPlaceholder',
    );
  });

  // -----------------------------------------------------------------------
  // Settings with optional/extra fields — future-proofing
  // -----------------------------------------------------------------------

  it('preserves syncProvider and themeOverride', () => {
    const journal = makeV0_16_Journal();
    const settings = (journal as Record<string, unknown>).settings as Record<string, unknown>;
    settings.syncProvider = 'gdrive';
    settings.remoteSync = true;
    settings.themeOverride = 'dracula';
    const result = migrate(journal) as Record<string, unknown>;
    const s = result.settings as Record<string, unknown>;
    expect(s.syncProvider).toBe('gdrive');
    expect(s.remoteSync).toBe(true);
    expect(s.themeOverride).toBe('dracula');
    expect(s).not.toHaveProperty('showMarkdownPlaceholder');
  });

  it('preserves unknown extra fields on settings (forwards compat)', () => {
    const journal = makeV0_16_Journal();
    const settings = (journal as Record<string, unknown>).settings as Record<string, unknown>;
    settings.futureField = 'should-survive';
    const result = migrate(journal) as Record<string, unknown>;
    expect((result.settings as Record<string, unknown>).futureField).toBe('should-survive');
  });

  it('preserves unknown extra fields on pages (forwards compat)', () => {
    const journal = makeV0_16_Journal();
    const pages = (journal as Record<string, unknown>).pages as Record<string, unknown>[];
    pages[0].futurePageField = { nested: true };
    const result = migrate(journal) as Record<string, unknown>;
    const p = (result.pages as Record<string, unknown>[])[0];
    expect(p.futurePageField).toEqual({ nested: true });
  });

  // -----------------------------------------------------------------------
  // Deep-copy safety — verify migration doesn't corrupt a reference kept
  // by the caller
  // -----------------------------------------------------------------------

  it('does not corrupt data when caller holds a reference to settings', () => {
    const journal = makeV0_16_Journal();
    const settingsRef = (journal as Record<string, unknown>).settings;
    migrate(journal);
    // The settings object the caller holds should be the same (mutated) object
    expect((journal as Record<string, unknown>).settings).toBe(settingsRef);
    expect(settingsRef as Record<string, unknown>).not.toHaveProperty('showMarkdownPlaceholder');
  });

  // -----------------------------------------------------------------------
  // Idempotency — running twice should not corrupt
  // -----------------------------------------------------------------------

  it('is idempotent — running twice produces the same result', () => {
    const journal = makeV0_16_Journal();
    migrate(journal);
    const snapshot = JSON.stringify(journal);
    migrate(journal);
    expect(JSON.stringify(journal)).toBe(snapshot);
  });

  // -----------------------------------------------------------------------
  // Empty / deleted pages — edge cases in real data
  // -----------------------------------------------------------------------

  it('handles journal with no pages', () => {
    const journal = makeV0_16_Journal({ pages: [] });
    const result = migrate(journal) as Record<string, unknown>;
    expect(result.pages as unknown[]).toHaveLength(0);
    expect(result.settings as Record<string, unknown>).not.toHaveProperty(
      'showMarkdownPlaceholder',
    );
  });

  it('handles journal with deleted pages', () => {
    const journal = makeV0_16_Journal();
    const pages = (journal as Record<string, unknown>).pages as Record<string, unknown>[];
    pages[0].deleted = true;
    const result = migrate(journal) as Record<string, unknown>;
    const p = (result.pages as Record<string, unknown>[])[0];
    expect(p.deleted).toBe(true);
    expect(p.text).toBe('Hello world');
  });
});
