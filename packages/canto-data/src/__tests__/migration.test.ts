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

  test('treats missing version as "1.0.0"', () => {
    const data = { foo: 'bar' };
    const result = migrateIfNeeded(data, undefined);
    // Since SCHEMA_VERSION is "1.0.0", no migration needed
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe('1.0.0');
  });

  test('throws on future version', () => {
    expect(() => migrateIfNeeded({}, '99.0.0')).toThrow(
      /Cannot open data with schema version 99\.0\.0/,
    );
  });

  test('migration registry is empty for v1 baseline', () => {
    expect(MIGRATIONS).toEqual([]);
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
    // Temporarily pretend SCHEMA_VERSION is "2.0.0" by adding a migration
    // We can't change SCHEMA_VERSION, so we test the chain logic differently:
    // Add a migration from 0.9.0 → 1.0.0 and pass fromVersion 0.9.0
    const migration: Migration = {
      from: '0.9.0',
      to: '1.0.0',
      description: 'test migration',
      migrate: (data) => ({ ...(data as Record<string, unknown>), migrated: true }),
    };
    MIGRATIONS.push(migration);

    const result = migrateIfNeeded({ value: 1 }, '0.9.0');
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('0.9.0');
    expect(result.toVersion).toBe(SCHEMA_VERSION);
    expect((result.data as Record<string, unknown>).migrated).toBe(true);
  });

  test('applies migration chain in order', () => {
    const order: string[] = [];
    MIGRATIONS.push(
      {
        from: '0.8.0',
        to: '0.9.0',
        description: 'step 1',
        migrate: (data) => {
          order.push('0.8→0.9');
          return { ...(data as Record<string, unknown>), step1: true };
        },
      },
      {
        from: '0.9.0',
        to: '1.0.0',
        description: 'step 2',
        migrate: (data) => {
          order.push('0.9→1.0');
          return { ...(data as Record<string, unknown>), step2: true };
        },
      },
    );

    const result = migrateIfNeeded({ original: true }, '0.8.0');
    expect(result.migrated).toBe(true);
    expect(order).toEqual(['0.8→0.9', '0.9→1.0']);
    const d = result.data as Record<string, unknown>;
    expect(d.original).toBe(true);
    expect(d.step1).toBe(true);
    expect(d.step2).toBe(true);
  });

  test('throws when migration fails', () => {
    MIGRATIONS.push({
      from: '0.9.0',
      to: '1.0.0',
      description: 'broken migration',
      migrate: () => {
        throw new Error('data corrupt');
      },
    });

    expect(() => migrateIfNeeded({}, '0.9.0')).toThrow(/Migration 0\.9\.0 → 1\.0\.0 failed/);
  });

  test('throws when no migration path exists', () => {
    // Version 0.5.0 with no migration from 0.5.0
    expect(() => migrateIfNeeded({}, '0.5.0')).toThrow(/No migration path from 0\.5\.0/);
  });
});
