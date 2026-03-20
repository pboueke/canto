// Types
export type {
  GeoLocation,
  Comment,
  Attachment,
  Page,
  PagePreview,
  JournalSettings,
  Journal,
  JournalContent,
  Filter,
  SyncProvider,
} from './types';

export { DEFAULT_JOURNAL_SETTINGS, pageToPreview } from './types';

// Version
export {
  SCHEMA_VERSION,
  compareVersions,
  needsMigration,
  isFutureVersion,
  isMajorUpgrade,
} from './version';

// Validation
export {
  ValidationError,
  isGeoLocation,
  isComment,
  isAttachment,
  isPage,
  isJournal,
  isJournalContent,
  validateGeoLocation,
  validateComment,
  validateAttachment,
  validatePage,
  validateJournalSettings,
  validateJournal,
  validateJournalContent,
} from './validation';

// Migration
export type { Migration, MigrationResult } from './migration';
export { migrateIfNeeded } from './migration';

// Format
export type { ExportManifest, AttachmentEntry, BuildManifestOptions } from './format';
export {
  buildExportManifest,
  parseManifest,
  collectAttachmentEntries,
  rewriteAttachmentPaths,
  serializePages,
  deserializePages,
} from './format';
