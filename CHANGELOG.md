# Changelog

## v0.10.0 - Best Practices & README Overhaul

- feat: ESLint rules strengthened — added `consistent-type-imports` and `no-console` rules
- feat: test coverage raised from 40% to 80% threshold (actual: 95%+)
- feat: 52 new tests for `useStorage`, `useImageQueue`, and `changelog` modules (317 total)
- feat: README overhauled — expanded security model section, corrected i18n (8 languages), themes (6), and crypto provider details
- feat: test count badge in README, auto-synced by pre-commit hook
- feat: `test:ci` script for CI-oriented test runs with coverage
- refactor: consolidated duplicate `generateUUID()` into `encryption/utils.ts` (was in `useStorage.ts` and `import.ts`)
- refactor: consolidated duplicate `base64ToUint8()` / `uint8ToBase64()` — `JournalKeyContext` and `useStorage` now import from `encryption/utils.ts`
- refactor: all type imports use `import type` syntax (enforced by ESLint)
- chore: removed unused imports in `backup.test.ts`
- chore: bump version to 0.10.0

## v0.9.4 - Native Crypto & Non-blocking Image Pipeline

- feat: replace `@noble/ciphers` (pure JS) with `expo-crypto` native AES-GCM — decryption runs on native thread via JSI, no longer blocks the JS thread
- feat: upgrade Expo SDK 54 → 55 (React 19.2, React Native 0.83)
- perf: decrypted images written to temp files (`file://` URIs) instead of held as multi-megabyte `data:` URI strings in React state — eliminates heavy string diffing during reconciliation
- perf: strategic `setTimeout(0)` yields within `aesGcmDecrypt`/`aesGcmEncrypt` before heavy synchronous operations (`base64ToUint8`, `textDecoder.decode`) — breaks ~200ms blocking into ~50ms chunks
- perf: `MAX_CONCURRENT` reduced from 2 to 1 — single image pipeline prevents doubled blocking windows
- perf: batched `setLoadedImages` + `setLoadingImages` state updates to reduce re-renders per image from 3 to 2
- perf: thumbnails in journal list also use file URIs instead of data URIs
- refactor: `@noble/ciphers` moved to devDependency (Jest mock only)
- refactor: `bytesToHex`/`hexToBytes` moved from `@noble/ciphers/utils.js` to local helpers in `device.ts`
- chore: added `expo-crypto` Jest mock in `jest.setup.ts` delegating to `@noble/ciphers` for test coverage
- chore: bump version to 0.9.4

## v0.9.3 - Image Loading UX & Journal Redirect

- fix: image loading no longer blocks UI — queue-based loader with concurrency limit and `setTimeout(0)` yields between decryption operations
- fix: shared thumbnail queue serialises all journal list thumbnails so they don't all decrypt at once
- fix: `ImageCarousel` cancels pending image loads on unmount, unblocking back-navigation
- fix: journal "not found" page now redirects to homepage via `router.replace('/')`
- perf: `InteractionManager.runAfterInteractions` defers image loading until navigation animations complete

## v0.9.2 - Backup Reliability & Test Coverage

- fix: disable ZIP compression for encrypted entries (`compression: 'STORE'`) — deflate/inflate on Hermes corrupted high-entropy ciphertext, causing `aes/gcm: invalid ghash tag` on import
- fix: import attachment ID regex relaxed from `[a-f0-9-]+` to `[^.]+` — non-hex IDs were silently dropped
- fix: auto-derive with empty password no longer marks imported journal as `secure: true` — prevents phantom password prompt for journals imported without a key
- fix: shared attachments across pages now get per-page copies on import — previously stored under one page's directory, risking orphaned references on page deletion
- fix: added step-level error logging in `importJournal` — identifies which specific file (journal metadata, settings, page, attachment) failed to decrypt
- test: 33 new end-to-end backup tests in `backup-e2e.test.ts` covering all conditional flows, attachment types, data equivalence, edge cases, and password-derived key round-trips

## v0.9.1 - Encrypted Backup Fix

- fix: encrypted export/import now stores ciphertext as raw binary in ZIP — JSZip's string compression on Hermes corrupted base64 text entries
- fix: replaced `atob`/`btoa` with pure-JS base64 implementation for Hermes compatibility
- fix: `getAttachment` now gracefully falls back when password decryption fails (matches existing `readEncrypted` pattern)
- refactor: consolidated three duplicate `base64ToUint8` copies into single export from `encryption/utils.ts`
- test: updated encrypted backup tests to use binary format

## v0.9.0 - Backup & Import

- feat: export journals as `.canto.zip` files via system share sheet, with optional password encryption
- feat: import journals from `.canto.zip` files with automatic UUID regeneration (safe to re-import)
- feat: two-phase password handling on import — required for encrypted ZIPs, optional (skippable) for unencrypted exports of secure journals
- feat: name conflict resolution on import with `(copy)`, `(copy 2)` suffixes
- feat: progress reporting during export and import (pages, attachments, zipping phases)
- feat: export menu in journal header with encryption toggle
- feat: import flow integrated into new journal modal with file picker
- fix: `readEncrypted` gracefully falls back to device-decrypted content when password decryption fails — prevents chicken-and-egg with auto-derive on non-secure journals that have encrypted attachments
- fix: import auto-derives key with empty password for non-secure journals with salt, preserving encrypted attachment status
- fix: import preserves original attachment filenames to prevent disk path hash collisions
- fix: `File.bytes()` used instead of `File.text()` for reading ZIP binary data (prevents UTF-8 corruption)
- chore: added `jszip` dependency
- chore: i18n — backup/import strings and `skip` button in all 8 languages
- test: 48 new tests for export, import, round-trip, and conflict resolution

## v0.8.4 - Pre-commit Hook Fix

- fix: pre-commit version sync hook now updates README badge independently from package.json — previously skipped README when package.json was already at the target version
- fix: README badge regex uses generic `version-[0-9.]*-` pattern instead of relying on the old package.json version

## v0.8.3 - Device Key Rotation Fix

- fix: device key rotation now correctly re-encrypts all journal data, not just the index — `reencryptAll` parsed the journal list from `readIndex()` which silently failed with the old cached key, returning an empty list
- fix: clear cached device key after rotation so subsequent operations use the new key
- fix: handle inconsistent encryption state from previous failed rotations — `oldDecrypt` tries both the cached key and the SecureStore key, recovering from partial re-encryption
- test: 4 new tests for key rotation — round-trip with new key, old key rejection, multi-journal rotation, and recovery from split-key state
- chore: bump version to 0.8.3

## v0.8.2 - Security Hardening

- feat: user-selectable PBKDF2 iteration count — 6 presets (50k/100k/200k/600k/800k/1M) per journal, default 50k for new journals, backward-compatible 20k for existing
- feat: KDF iteration picker (segmented pill) in new journal and change password modals with `?` explanation modal showing iteration values per preset
- feat: password explanation modal — `?` button next to password label explains device-level encryption and optional password layer
- feat: persistent rate limiter — unlock attempt count and lockout persist across app restarts via AsyncStorage
- feat: escalating lockout — 30s after 5 failed attempts, 5min after 10, 30min after 15
- feat: atomic password re-encryption — temp file + rename strategy prevents mixed-key state on crash
- feat: crash recovery on app launch — detects and completes interrupted re-encryption via .tmp files
- feat: global Security Settings modal accessible from home InfoBox — auto-lock timeout picker and device key rotation
- feat: session timeout / auto-lock — configurable inactivity timer (1m/5m/15m/off, default 5m), clears keys on background resume or inactivity
- feat: device key rotation — re-encrypts all stored data with a new 256-bit device key via SecureStore
- feat: graceful decryption error handling — corrupted or tampered files return null instead of crashing
- fix: biometric is now strictly an additional gate — password-protected journals always require the password, biometric cannot bypass it
- fix: password change now verifies current password via trial decryption (PBKDF2 always succeeds, so key must be tested against actual data)
- fix: journal creation failure on Android — `File.move()` throws `FileAlreadyExistsException` when target exists, now deletes before move
- fix: error display added to journal creation modal (was silently swallowing errors)
- fix: loading spinner shown during journal creation and non-password journal unlock
- fix: `kdfIterations` stored in journal metadata and index for backward-compatible key derivation
- docs: added JS memory limitation comments in password.ts and JournalKeyContext.tsx
- chore: i18n — added `security` section with all labels in all 8 languages, KDF preset `standard` renamed to `improved`
- chore: bump version to 0.8.2

## v0.8.1 - Always Derive Encryption Key

- fix: always generate salt and derive PBKDF2 key on journal creation, even when no password is set (uses empty string as fallback)
- fix: auto-derive empty-string key for non-secure journals on access, ensuring two-layer encryption for all new journals
- fix: safety-net key derivation on journal screen for deep link navigation
- fix: NewJournalCard height now matches JournalCard (130px)
- chore: bump version to 0.8.1

## v0.8.0 - Theming, Languages & UI Polish

- feat: add 4 new themes — Monokai, Solarized Light, Nord, Dracula — with full color definitions
- feat: add theme selection modal with miniature color previews on home screen
- feat: add per-journal theme override — each journal can use its own theme
- feat: journal cards on home screen render with their journal-specific theme
- feat: theme picker available in journal creation modal and journal settings
- feat: add 6 new languages — Spanish, German, French, Russian, Chinese, Italian (8 total)
- feat: add language selection modal with native language names on home screen
- feat: expand icon picker from 28 curated to all 287 Feather icons (scrollable)
- feat: full-screen journal creation modal matching journal settings layout
- fix: wrong password no longer navigates to "Journal not found" — trial decryption validates key before navigation
- fix: "New Journal" button on home screen now uses translated string
- refactor: replace theme toggle with named theme selection (`setThemeName`)
- refactor: replace language toggle with language picker modal
- chore: bump version to 0.8.0

## v0.7.0 - Journal Management and Password UX & Biometric Auth

- feat: add biometric authentication (fingerprint/face) as optional journal lock via expo-local-authentication
- feat: add biometric toggle in journal creation modal and journal settings
- feat: biometric gate prompts before journal access (both secure and non-secure journals)
- feat: add loading spinner with full UI swap during password change re-encryption
- feat: add no-recovery warning on password creation and change ("if you forget your password, your data will be permanently lost")
- feat: add biometric field to Journal model
- feat: add i18n strings for biometric auth and password warning (EN/PT)
- deps: expo-local-authentication
- feat: add full-screen journal settings panel with statistics, display toggles, icon/name change and danger zone
- feat: add 7 journal display settings toggles (24h time, preview tags/thumbnails/icons, filter bar, markdown tips, auto-location)
- feat: add sort order picker (newest first, oldest first, no sorting)
- feat: add change journal icon from settings
- feat: add change journal name from settings
- feat: add change/add/remove password with full re-encryption of all pages
- feat: add delete journal with confirmation (password for secure, type "delete {name}" for non-secure)
- feat: add filter bar with text search, date range pickers and property/tag filters
- feat: add filter modal with attachment type toggles (image, file, location) and tag selection
- feat: add useFilter hook for client-side page filtering (query, date range, properties, tags)
- feat: add useDeleteJournal and useSaveJournal storage hooks
- feat: add hasComments field to PagePreview model
- feat: add i18n strings for journal settings and filter bar (EN/PT)
- feat: respect journal sort order setting in page list
- feat: filter bar visibility controlled by journal settings toggle
- test: add useFilter hook tests (15 tests covering all filter types and combinations)
- test: add hasComments tests for pageToPreview
- test: add i18n tests for new dictionary sections
- deps: @react-native-community/datetimepicker

## v0.6.0 - Cleanup 1

- feat: add `clearKey()` to device encryption for zeroing cached keys on app background
- feat: add `clearSession()` to encryption service for session cleanup
- feat: add password strength validation (minimum 8 characters)
- feat: add unlock rate limiter (5 attempts, 30s lockout)
- feat: wire password validation into journal creation modal
- feat: wire rate limiter into journal access/unlock modal
- test: add device encryption tests (key generation, caching, encrypt/decrypt, clearKey)
- test: add encryption service tests (device-only, password-layered, generateSalt, clearSession)
- test: add password validation and rate limiter tests
- test: add model types tests (pageToPreview, DEFAULT_JOURNAL_SETTINGS)
- test: add localStorage tests (initialize, journals CRUD, pages CRUD, attachments)
- test: relocate root tests to colocated `__tests__/` directories
- test: add 40% statement coverage threshold (81 tests total)
- chore: add `npm audit --production` script and Makefile target
- chore: add `npm test` to pre-push hook
- chore: add `.nvmrc` with Node 20
- chore: add GPL-3.0 LICENSE file
- chore: remove unused `expo-crypto` dependency
- chore: rewrite README with badges, architecture docs and contributing guide
- chore: bump version to 0.6.0

## v0.5.0 - Entries

- feat: add full entry (page) creation, editing and preview with edit/preview mode toggle
- feat: add markdown rendering in preview mode via react-native-markdown-display
- feat: add mixed encrypted/non-encrypted attachment support per entry
- feat: add image carousel with separate carousels for plain and encrypted images (lock icon)
- feat: add image reorder (move left/right arrows) and remove in edit mode
- feat: add fullscreen image viewer via react-native-image-viewing with pinch-zoom
- feat: add file attachment display with extension badges, open/share via expo-sharing
- feat: add encrypted file support with password-layer decryption before opening
- feat: add geo tag with GPS coordinates, open in maps, long-press to copy
- feat: add tag editor with journal-wide tag suggestions popup and new tag creation
- feat: add comment system with add/edit/delete, each comment has UUID and timestamp
- feat: add attachment popup (FAB + modal) with 6 options (image, encrypted image, file, encrypted file, location, comment)
- feat: add page creation from journal FAB with navigation to edit mode
- feat: add save/delete handlers with dirty state tracking and discard confirmation
- feat: add useCreatePage, useDeletePage, useJournalTags, useAttachment hooks
- feat: add encrypted attachment file naming with e-prefix (eimg-/efl-) for portability
- feat: add derivedKey support to saveAttachment/getAttachment for encrypted attachments
- feat: add Comment.id field (UUID) for edit/delete targeting
- feat: add Attachment.encrypted field for mixed encryption per entry
- feat: add PagePreview.firstImage for journal list thumbnails
- feat: add journal screen auto-refresh on focus (useFocusEffect)
- feat: add i18n strings for all new entry features (EN/PT)
- feat: add file size display in file attachment preview (B/KB/MB)
- feat: add first unencrypted image thumbnail in journal page list
- feat: add Tag onRemove with colored X button inside tag pill
- refactor: replace all emojis with Feather icons (calendar, clock, map-pin, image, paperclip, arrow-left, check, edit-2, trash-2)
- refactor: replace attachment toolbar with FAB + popup modal
- refactor: remove welcome page auto-creation from journal creation
- style: save/confirm FAB is now green, + FAB and tag add button are now yellow
- style: standardize component margins, centralize geo tag
- style: page layout order — tags, images, encrypted images, geo tag, files, text body, comments
- deps: react-native-markdown-display, react-native-image-viewing, expo-image-picker, expo-document-picker, expo-location, expo-sharing, expo-clipboard

## v0.4.0 - Journal Creation

- feat: add journal creation modal with name, icon selection, and optional password
- feat: add Feather icon picker component with 28 curated flat icons via @expo/vector-icons
- feat: add password-protected journal creation with salt generation and PBKDF2 key derivation
- feat: add JournalKeyProvider context for session-level derived key caching (derive once, use many)
- feat: add two-layer encryption support in LocalStore (password AES-GCM + device AES-GCM)
- feat: add journal access modal for unlocking password-protected journals
- feat: add salt field to Journal type for cross-device password encryption portability
- feat: connect home screen to real encrypted filesystem storage via useJournals hook
- feat: connect journal and page screens to real data via useJournal/usePage hooks
- feat: add welcome page auto-creation for new journals
- refactor: replace all mock data with real storage layer throughout the app
- refactor: update JournalCard, JournalHeader, PageListItem to use real model types
- refactor: pass journalId as query parameter to page route for storage context
- chore: add @expo/vector-icons as direct dependency
- chore: add i18n keys for journal creation and unlock flows (EN/PT)
- chore: remove mockData.ts and associated test file

## v0.3.0 - Filesystem & Data Layer

- feat: add data models for journals, pages, comments, attachments, filters and settings
- feat: add two-tier encryption system (device-level + password-based per journal)
- feat: use AES-256-GCM authenticated encryption with PBKDF2-SHA256 (600k iterations)
- feat: add encrypted local storage using expo-file-system with structured directory layout
- feat: add remote store interface and sync engine with last-write-wins conflict resolution
- feat: add React hooks for storage integration (useJournals, useJournal, usePage, useSavePage)
- feat: add encryption and sync engine test suites (23 tests)
- refactor: changelog module now reads bundled CHANGELOG.md asset instead of duplicating content
- chore: add metro.config.js for .md asset bundling
- chore: add @noble/ciphers, @noble/hashes, expo-file-system, expo-secure-store, expo-crypto

## v0.2.0 - Styling & Navigation

- feat: replicate original home page layout with two-column design
- feat: match original light/dark color schemes from legacy app
- feat: add Lato and Merriweather font families
- feat: create navigation components (journal cards, page list, entry viewer)
- feat: add mock data for journals and entries
- feat: add theme-aware logo component
- feat: add floating action buttons for edit/save/delete actions
- feat: add tag pill components with theme colors
- feat: add journal header with settings and data buttons
- feat: add page header with date/time display
- feat: add changelog modal accessible from version number
- feat: add back navigation arrows on all sub-screens
- fix: header content overlapping Android notification bar
- fix: journal cards and new journal button now share the same flex row
- fix: "About Canto" link now opens the GitHub repository

## v0.1.0 - Repository Setup

- feat: initialize Expo SDK 55 project with TypeScript strict mode
- feat: set up Expo Router for file-based navigation
- feat: add light/dark theme system with AsyncStorage persistence
- feat: add i18n support (English / Portuguese)
- feat: add path aliases (@/ -> src/)
- chore: configure ESLint 10 flat config with TypeScript rules
- chore: add Prettier for code formatting
- chore: add Husky + lint-staged pre-commit hooks
- chore: add Jest + jest-expo testing setup
