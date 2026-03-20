import type { Migration } from '../migration';

/**
 * Registry of all schema migrations, ordered from oldest to newest.
 *
 * v1.0.0 is the baseline — no migrations exist yet.
 * When a breaking change is introduced, add a migration here:
 *
 *   { from: '1.0.0', to: '2.0.0', description: '...', migrate: (data) => ... }
 */
export const MIGRATIONS: Migration[] = [];
