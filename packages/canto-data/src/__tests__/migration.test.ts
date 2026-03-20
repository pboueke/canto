import { migrateIfNeeded } from '../migration';
import { MIGRATIONS } from '../migrations/index';
import { SCHEMA_VERSION } from '../version';
import type { Migration } from '../migration';

describe('migrateIfNeeded', () => {
  test('returns data unchanged when version matches SCHEMA_VERSION', () => {
    const data = { foo: 'bar' };
    const result = migrateIfNeeded(data, SCHEMA_VERSION);
    expect(result.migrated).toBe(false);
    expect(result.data).toBe(data);
    expect(result.fromVersion).toBe(SCHEMA_VERSION);
    expect(result.toVersion).toBe(SCHEMA_VERSION);
  });

  test('treats missing version as "0.16.0" and migrates to current', () => {
    const data = { foo: 'bar' };
    const result = migrateIfNeeded(data, undefined);
    // Missing version defaults to "0.16.0", which needs migration to 0.17.0
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('0.16.0');
    expect(result.toVersion).toBe(SCHEMA_VERSION);
  });

  test('throws on future version', () => {
    expect(() => migrateIfNeeded({}, '99.0.0')).toThrow(
      /Cannot open data with schema version 99\.0\.0/,
    );
  });

  test('migration registry contains v0.16.0 → v0.17.0 migration', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0].from).toBe('0.16.0');
    expect(MIGRATIONS[0].to).toBe('0.17.0');
  });
});

describe('migration chain (with mock migrations)', () => {
  // Save and restore the real MIGRATIONS array
  const originalMigrations = [...MIGRATIONS];

  afterEach(() => {
    MIGRATIONS.length = 0;
    MIGRATIONS.push(...originalMigrations);
  });

  test('applies single migration', () => {
    // Add a migration from 0.15.0 → 0.16.0; the real 0.16.0→0.17.0 migration
    // is already in originalMigrations and gets restored by afterEach,
    // so we need to include it to complete the chain to SCHEMA_VERSION.
    const migration: Migration = {
      from: '0.15.0',
      to: '0.16.0',
      description: 'test migration',
      migrate: (data) => ({ ...(data as Record<string, unknown>), mockMigrated: true }),
    };
    MIGRATIONS.push(migration, ...originalMigrations);

    const result = migrateIfNeeded({ value: 1 }, '0.15.0');
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('0.15.0');
    expect(result.toVersion).toBe(SCHEMA_VERSION);
    expect((result.data as Record<string, unknown>).mockMigrated).toBe(true);
  });

  test('applies migration chain in order', () => {
    const order: string[] = [];
    MIGRATIONS.push(
      {
        from: '0.14.0',
        to: '0.15.0',
        description: 'step 1',
        migrate: (data) => {
          order.push('0.14→0.15');
          return { ...(data as Record<string, unknown>), step1: true };
        },
      },
      {
        from: '0.15.0',
        to: '0.16.0',
        description: 'step 2',
        migrate: (data) => {
          order.push('0.15→0.16');
          return { ...(data as Record<string, unknown>), step2: true };
        },
      },
      ...originalMigrations, // include real 0.16.0→0.17.0 to complete chain
    );

    const result = migrateIfNeeded({ original: true }, '0.14.0');
    expect(result.migrated).toBe(true);
    expect(order).toEqual(['0.14→0.15', '0.15→0.16']);
    const d = result.data as Record<string, unknown>;
    expect(d.original).toBe(true);
    expect(d.step1).toBe(true);
    expect(d.step2).toBe(true);
  });

  test('throws when migration fails', () => {
    MIGRATIONS.push({
      from: '0.15.0',
      to: '0.16.0',
      description: 'broken migration',
      migrate: () => {
        throw new Error('data corrupt');
      },
    });

    expect(() => migrateIfNeeded({}, '0.15.0')).toThrow(/Migration 0\.15\.0 → 0\.16\.0 failed/);
  });

  test('throws when no migration path exists', () => {
    // Version 0.5.0 with no migration from 0.5.0
    expect(() => migrateIfNeeded({}, '0.5.0')).toThrow(/No migration path from 0\.5\.0/);
  });
});

describe('v0.16.0 → v0.17.0 migration', () => {
  test('removes showMarkdownPlaceholder from settings', () => {
    const oldData = {
      settings: {
        sort: 'descending',
        previewTags: true,
        showMarkdownPlaceholder: true,
      },
      pages: [],
    };
    const result = migrateIfNeeded(oldData, '0.16.0');
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('0.16.0');
    expect(result.toVersion).toBe(SCHEMA_VERSION);
    const settings = (result.data as Record<string, unknown>).settings as Record<string, unknown>;
    expect(settings).not.toHaveProperty('showMarkdownPlaceholder');
    expect(settings.sort).toBe('descending');
    expect(settings.previewTags).toBe(true);
  });

  test('v0.17.0 data passes through unchanged', () => {
    const currentData = {
      settings: { sort: 'descending', previewTags: true },
      pages: [],
    };
    const result = migrateIfNeeded(currentData, '0.17.0');
    expect(result.migrated).toBe(false);
    expect(result.data).toBe(currentData);
    expect(result.fromVersion).toBe('0.17.0');
    expect(result.toVersion).toBe('0.17.0');
  });

  test('future version throws error', () => {
    expect(() => migrateIfNeeded({}, '2.0.0')).toThrow(
      /Cannot open data with schema version 2\.0\.0/,
    );
  });
});
