import type { Migration } from '../migration';
import { v0_16_0_to_v0_17_0 } from './v0_16_0_to_v0_17_0';

/**
 * Registry of all schema migrations, ordered from oldest to newest.
 */
export const MIGRATIONS: Migration[] = [v0_16_0_to_v0_17_0];
