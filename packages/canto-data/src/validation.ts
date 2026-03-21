import type {
  GeoLocation,
  Comment,
  Attachment,
  Page,
  Journal,
  JournalContent,
  JournalSettings,
} from './types';

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly expected: string,
    public readonly received: string,
  ) {
    super(`Invalid field "${field}": expected ${expected}, got ${received}`);
    this.name = 'ValidationError';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkType(path: string, value: unknown, expected: string): void {
  const actual = typeOf(value);
  if (actual !== expected) {
    throw new ValidationError(path, expected, actual);
  }
}

function checkOptionalType(path: string, value: unknown, expected: string): void {
  if (value !== undefined) {
    checkType(path, value, expected);
  }
}

function checkEnum(path: string, value: unknown, allowed: readonly string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ValidationError(path, `one of ${JSON.stringify(allowed)}`, JSON.stringify(value));
  }
}

function checkString(path: string, value: unknown): void {
  checkType(path, value, 'string');
}

function checkNumber(path: string, value: unknown): void {
  checkType(path, value, 'number');
  if (!Number.isFinite(value as number)) {
    throw new ValidationError(path, 'finite number', String(value));
  }
}

function checkBoolean(path: string, value: unknown): void {
  checkType(path, value, 'boolean');
}

function checkArray(path: string, value: unknown): void {
  checkType(path, value, 'array');
}

function checkObject(path: string, value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(path, 'object', typeOf(value));
  }
}

// ---------------------------------------------------------------------------
// Type guards (boolean, no throw)
// ---------------------------------------------------------------------------

export function isGeoLocation(v: unknown): v is GeoLocation {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.latitude === 'number' && typeof o.longitude === 'number';
}

export function isComment(v: unknown): v is Comment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.text === 'string' && typeof o.date === 'string';
}

export function isAttachment(v: unknown): v is Attachment {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.path === 'string' &&
    typeof o.name === 'string' &&
    (o.type === 'image' || o.type === 'file') &&
    typeof o.encrypted === 'boolean' &&
    typeof o.deleted === 'boolean'
  );
}

export function isPage(v: unknown): v is Page {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.text === 'string' &&
    typeof o.date === 'string' &&
    Array.isArray(o.tags) &&
    Array.isArray(o.files) &&
    Array.isArray(o.images) &&
    Array.isArray(o.comments) &&
    typeof o.modified === 'number' &&
    typeof o.deleted === 'boolean'
  );
}

export function isJournal(v: unknown): v is Journal {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.icon === 'string' &&
    typeof o.date === 'string' &&
    typeof o.secure === 'boolean'
  );
}

export function isJournalContent(v: unknown): v is JournalContent {
  if (!isJournal(v)) return false;
  const o = v as unknown as Record<string, unknown>;
  return Array.isArray(o.pages) && typeof o.settings === 'object' && o.settings !== null;
}

// ---------------------------------------------------------------------------
// Structural validators (throw ValidationError with field path)
// ---------------------------------------------------------------------------

export function validateGeoLocation(v: unknown, path = 'location'): GeoLocation {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkNumber(`${path}.latitude`, o.latitude);
  checkNumber(`${path}.longitude`, o.longitude);
  if ((o.latitude as number) < -90 || (o.latitude as number) > 90) {
    throw new ValidationError(`${path}.latitude`, 'number in range [-90, 90]', String(o.latitude));
  }
  if ((o.longitude as number) < -180 || (o.longitude as number) > 180) {
    throw new ValidationError(
      `${path}.longitude`,
      'number in range [-180, 180]',
      String(o.longitude),
    );
  }
  checkOptionalType(`${path}.altitude`, o.altitude, 'number');
  checkOptionalType(`${path}.accuracy`, o.accuracy, 'number');
  return v as GeoLocation;
}

export function validateComment(v: unknown, path = 'comment'): Comment {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkString(`${path}.id`, o.id);
  checkString(`${path}.text`, o.text);
  checkString(`${path}.date`, o.date);
  return v as Comment;
}

export function validateAttachment(v: unknown, path = 'attachment'): Attachment {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkString(`${path}.id`, o.id);
  checkString(`${path}.path`, o.path);
  checkString(`${path}.name`, o.name);
  checkEnum(`${path}.type`, o.type, ['image', 'file']);
  checkBoolean(`${path}.encrypted`, o.encrypted);
  checkOptionalType(`${path}.size`, o.size, 'number');
  checkBoolean(`${path}.deleted`, o.deleted);
  return v as Attachment;
}

export function validatePage(v: unknown, path = 'page'): Page {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkString(`${path}.id`, o.id);
  checkString(`${path}.text`, o.text);
  checkString(`${path}.date`, o.date);
  checkOptionalType(`${path}.thumbnail`, o.thumbnail, 'string');
  if (o.location !== undefined && o.location !== null) {
    validateGeoLocation(o.location, `${path}.location`);
  }
  checkArray(`${path}.tags`, o.tags);
  for (let i = 0; i < (o.tags as unknown[]).length; i++) {
    checkString(`${path}.tags[${i}]`, (o.tags as unknown[])[i]);
    if (((o.tags as unknown[])[i] as string).trim() === '') {
      throw new ValidationError(`${path}.tags[${i}]`, 'non-empty string', '""');
    }
  }
  checkArray(`${path}.files`, o.files);
  for (let i = 0; i < (o.files as unknown[]).length; i++) {
    validateAttachment((o.files as unknown[])[i], `${path}.files[${i}]`);
  }
  checkArray(`${path}.images`, o.images);
  for (let i = 0; i < (o.images as unknown[]).length; i++) {
    validateAttachment((o.images as unknown[])[i], `${path}.images[${i}]`);
  }
  checkArray(`${path}.comments`, o.comments);
  for (let i = 0; i < (o.comments as unknown[]).length; i++) {
    validateComment((o.comments as unknown[])[i], `${path}.comments[${i}]`);
  }
  checkNumber(`${path}.modified`, o.modified);
  checkBoolean(`${path}.deleted`, o.deleted);
  return v as Page;
}

export function validateJournalSettings(v: unknown, path = 'settings'): JournalSettings {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkBoolean(`${path}.use24h`, o.use24h);
  checkBoolean(`${path}.previewTags`, o.previewTags);
  checkBoolean(`${path}.previewThumbnail`, o.previewThumbnail);
  checkBoolean(`${path}.previewIcons`, o.previewIcons);
  checkBoolean(`${path}.filterBar`, o.filterBar);
  checkEnum(`${path}.sort`, o.sort, ['ascending', 'descending', 'none']);
  checkBoolean(`${path}.autoLocation`, o.autoLocation);
  checkBoolean(`${path}.remoteSync`, o.remoteSync);
  if (o.syncProvider !== undefined) {
    checkEnum(`${path}.syncProvider`, o.syncProvider, ['gdrive']);
  }
  checkBoolean(`${path}.autoSync`, o.autoSync);
  checkOptionalType(`${path}.themeOverride`, o.themeOverride, 'string');
  return v as JournalSettings;
}

export function validateJournal(v: unknown, path = 'journal'): Journal {
  checkObject(path, v);
  const o = v as Record<string, unknown>;
  checkString(`${path}.id`, o.id);
  checkString(`${path}.title`, o.title);
  checkString(`${path}.icon`, o.icon);
  checkString(`${path}.date`, o.date);
  checkBoolean(`${path}.secure`, o.secure);
  checkOptionalType(`${path}.salt`, o.salt, 'string');
  checkOptionalType(`${path}.biometric`, o.biometric, 'boolean');
  checkOptionalType(`${path}.kdfIterations`, o.kdfIterations, 'number');
  checkOptionalType(`${path}.themeOverride`, o.themeOverride, 'string');
  return v as Journal;
}

export function validateJournalContent(v: unknown, path = 'journal'): JournalContent {
  validateJournal(v, path);
  const o = v as Record<string, unknown>;
  checkArray(`${path}.pages`, o.pages);
  for (let i = 0; i < (o.pages as unknown[]).length; i++) {
    validatePage((o.pages as unknown[])[i], `${path}.pages[${i}]`);
  }
  validateJournalSettings(o.settings, `${path}.settings`);
  // schemaVersion is optional for backward compat (legacy journals lack it)
  checkOptionalType(`${path}.schemaVersion`, o.schemaVersion, 'string');
  return v as JournalContent;
}
