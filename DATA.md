# canto-data

`canto-data` is the data model library for [Canto](https://github.com/pboueke/canto), a private encrypted journaling app. It provides TypeScript types, runtime validation, schema versioning, migration infrastructure, and export format utilities for Canto journals.

This package is **MIT-licensed** and has **zero dependencies** — it can be used independently of the Canto app to read, validate, and manipulate Canto journal data.

## Relationship to the Canto App

Canto (the app) is GPLv3-licensed. `canto-data` (this library) is MIT-licensed to enable data portability — anyone can build tools that interoperate with Canto journals without being bound by the app's copyleft license.

The library lives at `packages/canto-data/` in the Canto monorepo. The app itself imports and uses this library for all its data model needs. The library version tracks the app version.

```
canto (GPLv3)
├── app/                    # Expo Router screens
├── src/                    # App source (encryption, storage, sync, UI)
│   └── data/               # Thin re-exports from canto-data
└── packages/
    └── canto-data/ (MIT)   # ← This library
        └── src/
            ├── types.ts        # All TypeScript interfaces
            ├── validation.ts   # Type guards and structural validators
            ├── version.ts      # Schema version constant and semver utils
            ├── migration.ts    # Forward-only migration runner
            ├── migrations/     # Migration registry
            └── format.ts       # Export manifest and ZIP format utilities
```

What `canto-data` owns:

- All journal data types (Journal, Page, Attachment, Comment, etc.)
- Runtime validation and type guards
- Schema versioning and migration framework
- Export format specification (manifest structure, attachment naming)

What it does **not** include (these live in the app):

- Encryption/decryption (platform-specific: expo-crypto, Web Crypto API)
- Storage (platform-specific: expo-file-system, IndexedDB)
- Sync (Google Drive API integration)
- UI components

## Installation

```bash
# From npm (when published)
npm install canto-data

# From the monorepo (for Canto app development)
# Already available via npm workspaces — import directly
```

## Usage

### Importing

```typescript
import {
  type JournalContent,
  type Page,
  type Attachment,
  SCHEMA_VERSION,
  DEFAULT_JOURNAL_SETTINGS,
  validateJournalContent,
  ValidationError,
  parseManifest,
  migrateIfNeeded,
} from 'canto-data';
```

### Validating journal data

```typescript
import { validateJournalContent, ValidationError } from 'canto-data';

try {
  const journal = validateJournalContent(untrustedData);
  // journal is now typed as JournalContent
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(`Field: ${err.field}`);
    console.error(`Expected: ${err.expected}, got: ${err.received}`);
  }
}
```

### Reading an export manifest

```typescript
import { parseManifest } from 'canto-data';

const manifest = parseManifest(manifestJsonString);
// manifest.schemaVersion defaults to "0.16.0" for legacy exports
console.log(manifest.encrypted); // whether the export is password-encrypted
console.log(manifest.journalTitle); // original journal title
```

### Checking schema version and migrating

```typescript
import { migrateIfNeeded } from 'canto-data';

const result = migrateIfNeeded(rawData, manifest.schemaVersion);
if (result.migrated) {
  console.log(`Migrated from ${result.fromVersion} to ${result.toVersion}`);
}
// result.data is the (possibly migrated) journal data
```

### Working with exported journals

A `.canto.zip` file contains:

```
{journal-title}.canto.zip
├── manifest.json          # Always plaintext — parse with parseManifest()
├── journal.json           # Journal metadata (encrypted or plaintext)
├── settings.json          # Journal settings (encrypted or plaintext)
├── pages/
│   ├── {pageId}.json      # One file per page
│   └── ...
└── attachments/
    ├── {type}-{id}.{ext}  # Portable naming: image-{uuid}.jpg, file-{uuid}.pdf
    └── ...
```

Example: list all entries from an unencrypted export:

```typescript
import JSZip from 'jszip';
import { parseManifest, validateJournalContent } from 'canto-data';
import type { Page } from 'canto-data';

const zip = await JSZip.loadAsync(zipBuffer);
const manifest = parseManifest(await zip.file('manifest.json')!.async('string'));

if (manifest.encrypted) {
  console.log('This export is encrypted — you need the password to read it.');
} else {
  const pageFiles = zip.file(/^pages\/.*\.json$/);
  for (const pf of pageFiles) {
    const page: Page = JSON.parse(await pf.async('string'));
    console.log(`${page.date}: ${page.text.substring(0, 80)}...`);
  }
}
```

## Data Model

```
JournalContent
├── id: string (UUID)
├── title: string
├── icon: string (emoji)
├── date: string (ISO 8601, creation date)
├── secure: boolean
├── salt?: string (base64, present when secure=true)
├── biometric?: boolean
├── kdfIterations?: number (PBKDF2, default 50000)
├── themeOverride?: string
├── schemaVersion?: string (semver)
├── version: number (deprecated, always 1)
├── settings: JournalSettings
│   ├── use24h: boolean
│   ├── previewTags: boolean
│   ├── previewThumbnail: boolean
│   ├── previewIcons: boolean
│   ├── filterBar: boolean
│   ├── sort: 'ascending' | 'descending' | 'none'
│   ├── autoLocation: boolean
│   ├── remoteSync: boolean
│   ├── syncProvider?: 'gdrive'
│   ├── autoSync: boolean
│   └── themeOverride?: string
└── pages: Page[]
    ├── id: string (UUID)
    ├── text: string (Markdown)
    ├── date: string (ISO 8601, entry date)
    ├── modified: number (Unix timestamp ms)
    ├── deleted: boolean (soft-delete for sync)
    ├── thumbnail?: string (base64)
    ├── tags: string[]
    ├── location?: GeoLocation
    │   ├── latitude: number
    │   ├── longitude: number
    │   ├── altitude?: number
    │   └── accuracy?: number
    ├── comments: Comment[]
    │   ├── id: string
    │   ├── text: string
    │   └── date: string (ISO 8601)
    ├── images: Attachment[]
    │   ├── id: string (UUID)
    │   ├── path: string
    │   ├── name: string (original filename)
    │   ├── type: 'image'
    │   ├── encrypted: boolean
    │   ├── size?: number (bytes)
    │   └── deleted: boolean
    └── files: Attachment[]
        └── (same as images, with type: 'file')
```

## Schema Versioning

Canto journal schemas follow [semver](https://semver.org/):

| Change type                            | Version bump | Migration needed? |
| -------------------------------------- | ------------ | ----------------- |
| Breaking (field removed, type changed) | MAJOR        | Yes               |
| New optional field                     | MINOR        | No                |
| Documentation or validation fix        | PATCH        | No                |

The schema version is stored in `JournalContent.schemaVersion` and `ExportManifest.schemaVersion`. The schema version tracks the app version (e.g., app v0.17.0 uses schema `0.17.0`). Legacy data without `schemaVersion` is treated as `"0.16.0"` (the last version before the migration framework was first used). Migrations are forward-only.

### Migration history

| From   | To     | Description                                         |
| ------ | ------ | --------------------------------------------------- |
| 0.16.0 | 0.17.0 | Remove deprecated `showMarkdownPlaceholder` setting |

## Export Format Details

### manifest.json

```json
{
  "version": 1,
  "schemaVersion": "0.17.0",
  "appVersion": "0.17.0",
  "exportDate": "2026-01-01T00:00:00.000Z",
  "encrypted": false,
  "journalTitle": "My Journal",
  "salt": "base64...",
  "kdfIterations": 50000
}
```

- `version`: Manifest format version (always `1`)
- `schemaVersion`: Journal schema version (semver, tracks app version). Absent in legacy exports (treated as `"0.16.0"`)
- `encrypted`: If `true`, all JSON and attachment content is AES-256-GCM encrypted
- `salt` and `kdfIterations`: Present for password-protected journals

### Encrypted exports

When `encrypted: true`, decryption requires the journal password. The ciphertext format is `[12-byte nonce][ciphertext][16-byte GCM tag]` using AES-256-GCM. See [SECURITY.md](SECURITY.md) for the full encryption model.

### Import behavior

Importing always creates a new journal with new UUIDs — safe to re-import multiple times. Shared attachments get individual copies per page.

## Filesystem Structure

### Native (Android/iOS)

```
{documentDirectory}/canto/
├── journals.json                          # Encrypted index of all journals
├── {journalId}/
│   ├── metadata.json                      # Encrypted journal metadata + settings
│   ├── pages/
│   │   └── {pageId}.json                  # One encrypted JSON file per page
│   └── attachments/
│       └── [e]{img|fl}-{pageId}-{hash}.{ext}
```

Attachment naming: `{encPrefix}{typePrefix}-{pageId}-{hash}.{ext}` where `e` = password-encrypted, `img`/`fl` = type, `hash` = hash of original filename.

### Web (IndexedDB)

```
Database: 'canto' (version 1), Object store: 'files' (keyPath: 'path')

Virtual paths mirror native layout:
  canto/journals.json
  canto/{journalId}/metadata.json
  canto/{journalId}/pages/{pageId}.json
  canto/{journalId}/attachments/{typePrefix}-{pageId}-{hash}.{ext}
```

### Google Drive

```
My Drive/Canto/
├── {journalId}/
│   ├── metadata.json
│   ├── pages/{pageId}.json
│   └── attachments/{filename}
App Data (hidden):
└── canto-journals.json                    # Registry of synced journals
```

## License

MIT — see [LICENSE](packages/canto-data/LICENSE).
