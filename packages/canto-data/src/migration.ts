import { SCHEMA_VERSION, compareVersions, isFutureVersion } from './version';
import { MIGRATIONS } from './migrations/index';

export interface Migration {
  from: string;
  to: string;
  description: string;
  migrate(data: unknown): unknown;
}

export interface MigrationResult {
  data: unknown;
  migrated: boolean;
  fromVersion: string;
  toVersion: string;
}

/**
 * Apply any needed migrations to bring data from `fromVersion` to SCHEMA_VERSION.
 *
 * - If `fromVersion` is undefined, treats data as "0.16.0" (legacy).
 * - Migrations apply in sequence (0.16.0 → 0.17.0 → ...).
 * - Throws if the data is from a future version (can't downgrade).
 */
export function migrateIfNeeded(data: unknown, fromVersion?: string): MigrationResult {
  const version = fromVersion ?? '0.16.0';

  if (isFutureVersion(version)) {
    throw new Error(
      `Cannot open data with schema version ${version} — ` +
        `this app supports up to ${SCHEMA_VERSION}. Please update the app.`,
    );
  }

  if (compareVersions(version, SCHEMA_VERSION) === 0) {
    return { data, migrated: false, fromVersion: version, toVersion: SCHEMA_VERSION };
  }

  let current = version;
  let result = data;

  // Apply migrations in order
  for (const migration of MIGRATIONS) {
    if (compareVersions(current, migration.from) === 0) {
      try {
        result = migration.migrate(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Migration ${migration.from} → ${migration.to} failed: ${msg}` +
            ` (${migration.description})`,
        );
      }
      current = migration.to;
    }

    // Stop if we've reached the target
    if (compareVersions(current, SCHEMA_VERSION) === 0) break;
  }

  if (compareVersions(current, SCHEMA_VERSION) !== 0) {
    throw new Error(
      `No migration path from ${version} to ${SCHEMA_VERSION}. ` +
        `Reached ${current} but no further migrations available.`,
    );
  }

  return { data: result, migrated: true, fromVersion: version, toVersion: SCHEMA_VERSION };
}
