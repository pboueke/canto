import type { Migration } from '../migration';

/**
 * Migration from schema v0.16.0 to v0.17.0.
 *
 * Removes the deprecated `showMarkdownPlaceholder` field from journal settings.
 * This field was a dead toggle that had no effect on the UI.
 */
export const v0_16_0_to_v0_17_0: Migration = {
  from: '0.16.0',
  to: '0.17.0',
  description: 'Remove deprecated showMarkdownPlaceholder setting',
  migrate(data: unknown): unknown {
    if (data && typeof data === 'object' && 'settings' in data) {
      const settings = (data as Record<string, unknown>).settings;
      if (settings && typeof settings === 'object' && 'showMarkdownPlaceholder' in settings) {
        delete (settings as Record<string, unknown>).showMarkdownPlaceholder;
      }
    }
    return data;
  },
};
