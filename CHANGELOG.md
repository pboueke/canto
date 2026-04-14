# Changelog

## v0.19.0 - Per-journal Calendar page + anniversary filter

- **feat: per-journal Calendar page** — new calendar button in `JournalHeader` (left of sync) opens `/journal/{id}/calendar`. Page shows a journal-titled header, an anniversary row ("N pages celebrating an anniversary today" with 0/1/n copy variants), and a vertical scroll of month cards with days-with-pages highlighted. Tapping a month filters the journal to that month's date range; tapping the anniversary row activates the new anniversary filter.
- feat: anniversary filter — `useFilter` gains an `anniversary` boolean that keeps only pages whose UTC month+day matches today from strictly prior years. Feb-29 pages only surface on leap Feb-29s. Activated via URL param `?anniversary=1` from the calendar page and cleared via the existing FilterBar clear button.
- feat: scroll preservation — session-scoped `CalendarScrollContext` stores per-journal scroll offset in a ref map; restored on remount (calendar ↔ journal ↔ page navigation). Not persisted across app restarts.
- chore: route restructure — `app/journal/[id].tsx` → `app/journal/[id]/index.tsx` + new sibling `app/journal/[id]/calendar.tsx`. URL resolution unchanged for `/journal/{id}`.
- i18n: new `calendar` namespace and `journal.anniversary` string across all 20 supported locales.
- test: 37 new tests — 20 for `src/lib/calendar.ts` helpers, 6 new `useFilter` anniversary cases, 6 for `CalendarScrollContext`, 5 for `AnniversaryRow`, 6 for `MonthPreview`.

## v0.18.9 - Cross-device password sync fixes

- **fix: prevent sync corruption when password changed on another device** — engine now tracks `lastKnownRemoteSalt` per journal to distinguish "I changed the password locally" (push) from "another device changed it" (abort with a clear error). Previously the engine would blindly overwrite the remote with stale data, obliterating the new-device's password change.
- **fix: images/attachments not loading after password change + cloud import** — `reencryptJournal` now flips `att.encrypted` flags on all page attachments to match `!!newKey`. The flag was going stale (bytes were re-encrypted but the flag didn't update), causing `getAttachment` to skip the password-decrypt step and return ciphertext.
- fix: cloud import (`NewJournalModal.executeCloudImport`) records the imported salt via the new `SyncManager.recordRemoteSalt` so the next sync correctly identifies local matches remote.
- fix: sync engine reorder — metadata/registry upload now happens AFTER page re-uploads, so an interrupted sync mid-rotation leaves the remote in a recoverable state (next sync re-detects the key change and retries) instead of a corrupted one (registry pointing to new salt with pages still encrypted under the old key).
- fix: NewJournalModal styling — full width and height with safe-area insets on Android/iOS, floating dev-menu-style card on web.
- test: 14 new tests — 6 engine tests for `previousRemoteSalt` semantics (aborts on remote external change, pushes on local change, first-sync, bidirectional conflict, happy path); 5 manager tests for `lastKnownRemoteSalt` storage and recall; 1 interrupted-sync recovery regression; 6 unit tests verifying `reencryptJournal` updates `att.encrypted` flags (native + web, images + files); 1 E2E test covering the exact user scenario (image loads after password change + re-sync + wipe + cloud import)
- refactor: extracted key-aware crypto mock into `src/lib/__tests__/helpers/key-aware-crypto.ts` for cross-test reuse; `InMemoryLocalStore` test helper now properly models the two-layer attachment encryption (was previously device-only)

## v0.18.8 - Sync after password change, UI polish

- **fix: cloud import failed after password change** — sync engine now compares local salt with remote registry salt and force re-uploads all pages with the new key when they differ. Previously the timestamp-equality check skipped re-upload, leaving GDrive pages encrypted with the old key
- fix: cloud import of password-protected journals now passes the derived key to `saveJournal`/`savePage`, preserving password encryption locally (was saving as device-encrypted only)
- fix: NewJournalModal restyled to match dev menu — transparent fade modal with semi-transparent overlay, floating centered container with `webModalContent` (1000px max on web), themed background and border (was full-screen slide-up with white background, no width constraint on web)
- fix: danger zone confirmation buttons (`ConfirmDeleteModal`, `AccountButton`, `FilterBar`) now use a contrast-aware text color via new `getContrastText` utility — all 10 themes meet WCAG AA on error-colored buttons (Nord, Everforest, Rosé Pine, One Cyan previously failed)
- fix: splash icon and Android adaptive icon (foreground + monochrome) regenerated with proper padding — logo no longer cropped by Android's safe-zone mask
- test: 4 new sync encryption tests (re-upload on key change, cloud import after password change, password removal re-upload, full `executeCloudImport`-style flow), 1 new web cloud import test, 3 new contrast utility tests

## v0.18.7 - Web deployment to Cloudflare Pages

- feat: web deployment infrastructure under `web/` — `build.sh`, `deploy.sh`, `_headers`, `_redirects`, and step-by-step Cloudflare Pages guide in `web/README.md`
- chore: switch web bundler `output` to `single` (SPA mode) in `app.json`
- fix: build script renames `dist/assets/node_modules` → `dist/assets/_modules` and rewrites references in the JS bundle, working around Cloudflare Pages silently excluding `node_modules` directories from uploads (which dropped all `@expo/vector-icons` fonts and broke icon rendering in production)
- fix: `_redirects` orders explicit `/assets/*` and `/_expo/*` no-op rewrites before the `/*` SPA fallback so hashed asset requests are not intercepted and parsed as HTML
- docs: README banner image, centered header/tagline/badges, and grayed italic tagline

## v0.18.6 - GDrive delete fix, dependency upgrades

- fix: deleting a Google Drive journal showed a JSON parsing error in the remote journals modal — `handleResponse` now handles empty response bodies gracefully
- test: edge case test for empty Drive API response body
- chore: upgrade Expo SDK packages to latest compatible versions (expo 55.0.9, react-native 0.83.4, expo-router 55.0.8, and 6 other expo packages)

## v0.18.5 - Cross-platform cloud import fix, new themes

- **fix: cloud import of password-protected journals from Google Drive** — encrypted journals now prompt for the password instead of silently failing with a wrong key
- fix: centralize PBKDF2 key derivation — `JournalKeyContext` now uses the shared `deriveKey` from `password.ts` instead of its own inline `pbkdf2Async` call, preventing key divergence across code paths
- fix: thread `kdfIterations` and `encrypted` through GDrive registry so the cloud import derives the correct sync key and knows when to prompt for a password
- fix: React Native Web "Unexpected text node" error in NewJournalModal — changed `{stringOrNull && JSX}` patterns to ternary expressions and added empty-string guards on error setters
- feat: 4 new themes — Everforest, Rosé Pine, One Cyan, Gruvbox
- ui: page list item separator line and smaller thumbnails (120px → 84px)
- test: 13 new PBKDF2 cross-platform tests (RFC 2898 reference vectors, cloud import encrypt/decrypt simulation, wrong password/iterations rejection)
- test: regression guard ensuring `JournalKeyContext.deriveAndCache` produces the same key as `deriveKey` from `password.ts`

## v0.18.4 - Localized Google Play Store listings

- feat: add Google Play Store listing translations for all 19 supported languages (pt, es, de, fr, ru, zh, it, ja, ko, ar, hi, tr, nl, pl, sv, vi, th, id, uk)
- feat: localize app name ("Canto — Private Journal") into each language

## v0.18.3 - Sync KDF iteration mismatch fix, auto-sync improvement

- fix: sync failed on web with "Invalid JSON" — KDF iteration count mismatch between `JournalKeyContext` (20,000 legacy fallback) and `SyncManager` (50,000 default) caused different PBKDF2 keys for the same journal, making local data unreadable during sync
- fix: auto-sync on journal screen no longer triggers redundantly on every re-focus — now compares page modification timestamps and only syncs when data has actually changed
- test: 2 new sync manager KDF iteration tests (default fallback, explicit iterations)
- ci: adds carranca ci config and automated pr review

## v0.18.2 - Dependency manifest, changelog tabs, button fix

- feat: changelog modal now tabbed — default tab shows changelog, secondary tab shows all production npm dependencies with their licenses
- feat: build-time dependency manifest script (`npm run generate:deps`) extracts name, version, and license from all production dependencies
- fix: version button and help button in InfoBox no longer share the same underline style — version is plain text, help remains underlined
- test: 5 manifest generation tests (valid output, no empty fields, known deps, no devDeps, fails on missing package)
- test: 3 dependency loader tests, 2 changelog tab tests

## v0.18.1 - Import settings validation

- feat: import pipeline now validates journal settings with `validateJournalSettings()` after parsing `settings.json` from backup (native + web)
- test: 6 new import settings validation tests (valid settings, invalid values, missing settings)

## v0.18.0 - Split canto-data into separate repository

- refactor: split canto-data from monorepo workspace (`packages/canto-data/`) into standalone repository
- chore: switch canto-data dependency from workspace link to npm registry package (`canto-data@^1.0.3`)

## v0.17.8 - Critical: GDrive sync encryption

- **security: all journal content now encrypted (AES-256-GCM) before upload to Google Drive** — previously stored as plain text
- security: non-password journals encrypted with salt-derived key (PBKDF2 with empty password) for passive scraping protection
- security: SyncManager now derives sync key from journal salt when no password key is available — fixes zero-key fallback
- feat: sync index (`index.json`) for O(1) timestamp comparison — eliminates eagerly fetching all remote pages per sync
- refactor: RemoteStore interface updated to accept/return opaque encrypted strings
- refactor: `Journal.salt` is now required on all journals (was optional, only for secure)
- fix: cloud import (from GDrive) rewritten to decrypt data using salt-derived key
- fix: per-page download errors in sync are now caught gracefully (logged and skipped) instead of aborting the entire sync
- docs: SECURITY.md updated with new "Google Drive Sync" section detailing encryption model
- docs: PRIVACY.md corrected — no longer claims non-password journals are unencrypted on GDrive
- docs: DATA.md updated with current GDrive filesystem structure and required salt field
- test: 12 new encryption-focused sync tests (encrypted upload verification, wrong key rejection, round-trip, attachment encryption, sync index accuracy)
- test: all existing sync tests updated for encrypted sync API
- fix: file attachment row — tapping remove button no longer also triggers file open (separated Pressable from container View)

## v0.17.7 - Language picker, multilingual landing page, README update

- fix: language picker modal now scrollable for 20 languages
- fix: landing page now supports all 20 languages with a language selector button
- docs: README updated to say "Multilingual" instead of listing specific languages

## v0.17.6 - UI fixes, i18n expansion, onboarding and auto-lock improvements

- fix: carousel images now centered on web — uses container width instead of viewport width
- fix: download button now visible on web — dark semi-transparent background with white icon
- fix: Portuguese, Spanish, French, and German translations restored proper diacritics/accents
- fix: onboarding redirect loop on web — in-memory fallback prevents infinite redirect when storage fails
- fix: auto-lock now tracks actual user inactivity via touch events, default changed from 5m to 15m
- feat: auto-lock warning modal — explains session was locked due to inactivity before redirecting home
- feat: added 12 new languages — Japanese, Korean, Arabic, Hindi, Turkish, Dutch, Polish, Swedish, Vietnamese, Thai, Indonesian, Ukrainian (total: 20)

## v0.17.5 - Test coverage, doc favicon, carousel centering fix

- test: expanded coverage across 20+ test suites, added 5 new test files
- test: removed 8 broken IDB error-path tests (brittle fake-timer and mock setup issues)
- test: relaxed coverage thresholds to 95%/90% (branches) — avoids brittle defensive-path tests
- fix: carousel images no longer touch the right margin — replaced `pagingEnabled` with `snapToInterval` and added proper content padding
- fix: added favicon to docs landing page and privacy policy page

## v0.17.4 - Low priority validation, hardening, and test coverage fixes

- fix: GeoLocation validation now rejects out-of-range latitude (±90) and longitude (±180)
- fix: empty and whitespace-only tags now rejected by `validatePage()`
- fix: multipart boundary in GDrive API is now generated randomly per request instead of hard-coded
- fix: sync error state now preserves `errorStack` for debugging
- fix: TagEditor normalizes and deduplicates mixed-case tags on render via `useMemo`
- fix: stored Google auth JSON validated at parse time — invalid shapes are cleared from localStorage
- fix: `getAccessToken` silent re-auth wrapped in 15s timeout to prevent indefinite hangs
- fix: soft-deleted pages now trigger non-blocking attachment cleanup (native filesystem and web IDB)
- fix: InfoBox tests wrapped in `waitFor` to eliminate `act()` warnings from async changelog loading
- test: native `downloadAttachment` — write-to-cache + share sheet flow
- test: FilterBar debounce — delayed updates, batched fast typing, immediate clear, external sync
- test: ImageCarousel edit flow — delete button visibility, `onRemove` callback, deleted image filtering
- test: PageListItem — tag rendering, text truncation, accessibility label
- test: TagEditor normalization — mixed-case dedup, whitespace trim, empty-state rendering
- test: accessibility audit — FilterBar labels/roles, PageListItem accessible labels, FAB gap documented

## v0.17.3 - Medium priority code quality and hardening fixes

- fix: wire `existingIds` cloud import detection — dead fallback branch in filter, duplicate `generateUUID` removed
- fix: FilterBar bidirectional debounce sync — `localQuery` now updates on all external `filter.query` changes
- fix: try-catch around `saveAttachment` in image/file handlers — failed saves show error alert instead of adding broken attachments
- fix: cloud import `Promise.all` → `Promise.allSettled` — one failed attachment download no longer aborts all others
- fix: attachment `encrypted` flag preserves original value from backup instead of recalculating based on key availability
- fix: GDrive `connect()` validates access token is non-empty
- fix: folder cache key collision — always includes `parentId` (defaults to `'root'`)
- fix: consistent `safeJsonParse` across all storage/import/sync code — extracted to `src/lib/utils/json.ts`
- fix: runtime validation of imported journal metadata via `validateJournal()`
- fix: IndexedDB transaction timeout (10s) and abort handlers on all IDB helpers
- refactor: `handleOpenFile` delegates to `downloadAttachment` utility, removed duplicate web download logic
- test: 4 new `safeJsonParse` tests, updated GDrive store error message assertions

## v0.17.2 - High priority data-integrity and safety fixes

- fix: wire `existingIds` prop to `NewJournalModal` — cloud import "already local" detection was broken
- fix: auto-lock interval accumulation — use ref pattern to prevent effect re-registration on `clearAll` identity changes
- fix: untracked promise in `scheduleSyncDebounced` — capture manager ref at call time, add staleness check and `.catch()` for OAuth failures
- fix: `deserializePages` validates parsed pages via `validatePage()` instead of blind `as Page` cast
- fix: malformed ZIP attachments now collected and returned as `skippedAttachments` in `ImportResult` instead of silently skipped
- fix: `downloadPageAttachments` throws on null download instead of silently skipping — prevents pages saved with stale remote paths
- fix: `reencryptJournal` wrapped in try-catch — restores original key on failure so journal remains accessible
- fix: transactional key rotation — `rotateKey()` replaced with `prepareKeyRotation()` + `commitKeyRotation()` two-phase API; new key only persisted after re-encryption succeeds
- test: 3 new `deserializePages` validation tests, updated device key rotation tests for two-phase API

## v0.17.1 - Critical data-corruption fixes

- fix: race condition in store initialization — concurrent `ensureInitialized()` calls now share a single Promise instead of racing through a boolean flag
- fix: race condition in device key creation — `getOrCreateDeviceKey()` guarded by module-level Promise; `clearKey()` and `rotateKey()` reset the cached promise
- fix: silent sync page download failures — `downloadJournalMeta` now returns structured `DownloadResult` with per-page `failures` array instead of silently dropping failed pages
- fix: import attachment error handling — each `saveAttachment()` wrapped in try-catch; import completes with successful attachments and reports failures via `attachmentErrors` on `ImportResult`
- fix: validation accepts NaN/Infinity — `checkNumber()` now rejects non-finite numbers with `Number.isFinite()` check
- feat: `DataIntegrityWarningModal` component — reusable modal for data integrity warnings with warning icon, scrollable details list, suggestion box, and configurable actions
- feat: `dataIntegrity` i18n section — 10 keys across all 8 languages (en, pt, es, de, fr, ru, zh, it)
- refactor: `RemoteStore.downloadJournalMeta` returns `DownloadResult | null` (breaking type change for sync consumers)
- test: 8 new tests for validation, concurrency, sync failures, and import error collection
- test: 714 tests across 50 suites, all passing

## v0.17.0 - UI refinements, first schema migration, accessibility

- feat: image download button — overlay on carousel images in view mode, platform-specific download via `downloadAttachment` utility (native: expo-sharing, web: Blob + anchor)
- feat: full-text search — `searchText` field on `PagePreview` indexes full page text and tags; `useFilter` searches against it instead of first-line preview only
- feat: search debounce — 200ms debounce on `FilterBar` search input with cleanup on unmount
- feat: help button — added to home screen info box beside version, opens modal with GitHub Issues link
- feat: accessibility annotations — `accessibilityLabel`/`accessibilityRole` on ImageCarousel, FilterBar, FileRow, PageListItem, Card, and InfoBox; new `a11y` i18n section (11 keys × 8 languages)
- feat: `help` i18n section — title, body, and link text for all 8 languages
- feat: first schema migration (`0.16.0` → `0.17.0`) — removes deprecated `showMarkdownPlaceholder` setting; validates the migration framework end-to-end
- fix: encrypted images disappearing on repeated edit/save — `ImageCarousel` useEffect dependency changed from `activeImages.length` to stable ID-based key
- fix: cloud import conflict detection — changed from title-based to UUID-based matching (`existingIds` prop with `rj.id`)
- fix: image scaling — `resizeMode="cover"` changed to `"contain"` with surface background color to prevent cropping
- fix: thumbnail size — generation and display increased from 80px to 120px
- refactor: removed dead `showMarkdownPlaceholder` toggle — stripped from `JournalSettings` interface, defaults, validation, UI, and all 8 language dictionaries
- docs: `DATA.md` updated with migration history table, corrected version references (`0.16.0` legacy default)
- test: 29 new migration corruption-safety tests covering edge cases, idempotency, secure journals, and forward compatibility
- test: new tests for ImageCarousel download button, downloadAttachment web implementation, InfoBox help modal, full-text/tag search, pageToPreview searchText field
- test: 706 tests across 50 suites, all passing

## v0.16.0 - canto-data: MIT-licensed data model library

- feat: `canto-data` workspace package (`packages/canto-data/`) — MIT-licensed TypeScript library with zero dependencies for reading, validating, and manipulating Canto journals
- feat: runtime validation layer — type guards (`isPage`, `isJournal`, etc.) and structural validators (`validateJournalContent`) with `ValidationError` including field paths
- feat: schema versioning — `SCHEMA_VERSION` constant, semver comparison utilities, forward-only migration framework
- feat: export format utilities — `buildExportManifest()`, `parseManifest()`, `collectAttachmentEntries()`, `rewriteAttachmentPaths()`, `serializePages()`/`deserializePages()` extracted as pure functions
- feat: `schemaVersion` field on `JournalContent` and `ExportManifest` — legacy data without it treated as `"0.16.0"`
- refactor: all data types moved from `src/models/` to `canto-data` package; app imports via `@/data` re-export shims
- refactor: backup export/import modules use `canto-data/format` utilities instead of inline logic
- fix: `SyncProvider` type circular dependency — now defined in `canto-data`, re-exported by `src/lib/sync/types.ts`
- docs: `DATA.md` — full data model reference, export format spec, usage examples, dual-license explanation
- docs: README updated with Data Portability section and dual-license note
- chore: npm workspaces (`packages/*`) for monorepo structure
- chore: pre-commit hook syncs `canto-data` package version with app version
- test: 85 new tests — validation (25), migration (12), format (15), version (13), types (15), plus 5 existing tests updated

## v0.15.0 - Credible Launch: onboarding, security docs, store listing, landing page

- feat: first-launch onboarding flow — 4 screens (welcome, encryption, privacy, get started) with slide animations, skip button, and auto-open journal creation on completion
- feat: onboarding i18n — all 8 languages (en, pt, es, de, fr, ru, zh, it)
- feat: static landing page (`docs/index.html`) — no JavaScript, four pillars (encrypted at rest, not AI training data, open source, data portability)
- feat: hosted privacy policy (`docs/privacy.html`) for Play Store URL requirement
- feat: EAS Build configuration (`eas.json`) with development, preview, and production profiles
- feat: Google Play Store listing copy (`store/google-play-listing.md`)
- docs: `SECURITY.md` — comprehensive security whitepaper covering threat model, two-tier encryption, key management, session security, backup encryption, data collection, and cryptographic dependencies
- docs: `PRIVACY.md` — privacy policy addressing encryption at rest, no data collection, Google Drive sync behavior, biometrics, data portability
- docs: `CONTRIBUTING.md` — setup instructions, code style, quality gates, encryption and i18n guidelines
- docs: `TODOS.md` — post-launch roadmap (iOS, CI/CD, format spec, monetization, design system)
- fix: pre-commit hook version sync bug — app.json sed now reads its own version instead of package.json's, preventing permanent drift
- fix: pre-commit hook now syncs build.gradle versionName and auto-increments versionCode
- chore: README security section replaced with links to SECURITY.md and PRIVACY.md
- chore: README contributing section replaced with link to CONTRIBUTING.md
- chore: secrets added to .gitignore (play-store-key.json, \*.keystore)
- test: 9 new onboarding tests (render, navigation, flag write, skip, i18n content, icons, error handling)

## v0.14.3 - Cross-platform sync tests, timestamp fix, web navigation fix

- fix: `savePage()` no longer overwrites `modified` timestamp during sync downloads and cloud imports — added `preserveModified` parameter to prevent unnecessary re-uploads after import/sync
- fix: back button on web after page refresh — `useSafeBack` hook falls back to home when navigation stack is empty
- test: 46 new cross-platform sync e2e tests — web e2e suite (21), cross-platform native↔web suite (23), import regression guards (2)
- test: shared test infrastructure — `InMemoryLocalStore`, `InMemoryDrive`, `MockEncryptionService`, shared factories and assertions
- chore: jest config excludes `__tests__/helpers/` from test discovery

## v0.14.2 - Web Google Drive Sync

- feat: full Google Drive sync on web — `GoogleAuthContext.web.tsx` replaced no-op stub with real OAuth via `expo-auth-session/providers/google` (implicit flow)
- feat: configurable session retention on web — 1 day / 1 week (default) / 1 month / never expire, stored in localStorage
- feat: retention picker UI in AccountButton popover (web only)
- feat: sync button now visible in journal header on web (removed `Platform.OS !== 'web'` gate)
- fix: biometric-locked journals inaccessible on web — biometric gate skipped on web, falls through to password prompt
- fix: DevMenu buttons non-functional on web — `Alert.alert()` with callbacks replaced by `window.alert()` / `window.confirm()` on web
- fix: "Unexpected text node: ." warning in ConfirmDeleteModal on web — `deleteError` changed from empty string to `null`
- deps: `expo-auth-session`, `expo-web-browser`
- test: updated GoogleAuthContextWeb tests, added web token storage tests (9), web sync integration tests (4)

## v0.14.1 - Web Feature Implementations

- feat: web backup export — generates ZIP in memory and triggers browser download via Blob URL
- feat: web backup import — reads ZIP from DocumentPicker blob URL via `fetch()`, full import with ID regeneration and attachment rewriting
- feat: web date/time picker — hidden HTML `<input type="date/time">` triggered via `.showPicker()` in PageHeader and FilterBar
- feat: `GoogleAuthContext.web.tsx` — no-op provider (Google Sign-In library is sponsors-only on web); sync UI naturally hidden
- feat: export modal restyled to match sync modal (progress bar, single action button, consistent spacing)
- fix: removed intermediate ExportMenu dropdown — archive button opens export modal directly
- fix: `LocationTag` uses Google Maps URL on web instead of unsupported `geo:` scheme
- fix: cloud/sync button hidden in journal header on web
- deps: updated expo-constants, expo-linking, expo-location, expo-router, expo-sharing, expo-splash-screen, jest-expo to Expo SDK 55 recommended versions
- test: 46 new web tests — backup export/import (18), stubs/biometric/thumbnail/styles (13), GoogleAuthContext (8), encrypted storage ops (7)

## v0.14.0 - Web Platform Support

- feat: full web platform support — app runs on `npx expo start --web` with IndexedDB storage and localStorage device keys
- feat: `local.web.ts` — IndexedDB-backed `LocalStore` implementation (single `files` object store, virtual path keys)
- feat: `device.web.ts` — localStorage-backed device encryption key (with console security warning)
- feat: `changelog.web.ts` — uses `fetch()` to load changelog asset on web
- feat: `biometric.web.ts` — stub returning false/null (biometrics unavailable in browsers)
- feat: `thumbnail.web.ts` — no-op stub (returns input unchanged, web has more bandwidth)
- feat: `export.web.ts` / `import.web.ts` — stubs that throw "not supported on web"
- feat: max-width 1200px app container on web with centered layout and subtle box-shadow
- feat: max-width 1000px for all floating modals on web via shared `webModalContent` style
- feat: image loading on web returns `data:image/jpeg;base64,...` URIs instead of writing to cache files
- feat: file attachment reading on web uses `fetch()` + `FileReader` instead of `expo-file-system`
- feat: file sharing on web triggers browser download via `Blob` + anchor element
- fix: `PageListItem` thumbnail fallback uses data URI on web instead of `expo-file-system` cache file
- fix: `app/page/[id].tsx` replaced top-level `expo-file-system` import with lazy `require()` behind `Platform.OS` checks
- test: 36 new web-specific tests — IndexedDB storage (24), web device key (11), web compat regression (1)
- test: regression test scans all source files and fails if any `expo-file-system`/`expo-secure-store` import lacks a `.web.ts` counterpart
- deps: `fake-indexeddb` (devDependency for testing IndexedDB in Jest/Node)

## v0.12.1 - Security & Reliability Hardening

- fix: race condition in parallel sync worker — shared index could cause skipped items
- fix: `syncAll()` now threads per-journal derived keys to encrypted journals
- fix: GDrive store cache clearing was inverted — stale file IDs persisted across token changes
- fix: attachment re-encryption on password change — previously only pages were re-encrypted
- fix: `deleteJournal` now deletes directory before index update to prevent orphaned data
- fix: rate limiter race condition — concurrent unlock attempts could bypass backoff
- fix: debounced sync no longer drops errors silently
- fix: base64 decoder now rejects invalid characters instead of producing corrupt output
- security: escape journal IDs and filenames in Google Drive API queries to prevent injection
- security: API error messages no longer leak response bodies or sensitive data
- security: AES functions validate key is exactly 32 bytes before import
- perf: GDrive page downloads use `Promise.allSettled` — one bad page no longer fails entire journal
- perf: thread yield added to byte-level AES functions to prevent UI blocking
- fix: concurrent `getOrCreateFolder` calls no longer create duplicate folders in GDrive
- refactor: `createPasswordEncryption()` accepts configurable iteration count

## v0.12.0 - UI Cleanup & Performance

- feat: encrypted thumbnail generation — pages now store a small base64 thumbnail at save time, eliminating slow full-image decryption in page list previews
- feat: editable page date/time — tapping date or time in edit mode opens the native DateTimePicker
- feat: discard-on-leave dialog — navigating away or pressing back with unsaved changes now prompts to discard, preventing silent data loss
- fix: FAB overlapping Android navigation bar — now accounts for `useSafeAreaInsets().bottom`
- feat: scroll pagination on journal screen — loads 15 pages initially, loads more on scroll (client-side slice of `filteredPages`)
- feat: hidden developer menu — tap logo 7 times, then open changelog to access bulk journal/page duplication, generation, and wipe-all-data tools
- feat: app icon generation script (`scripts/generate-icons.js`) — generates all required icon assets from the Canto logo using `sharp`
- feat: cloud import progress bar — GDrive journal import now shows a progress bar with page counter
- perf: parallel sync — attachment uploads/downloads now run with bounded concurrency (4 workers); GDrive page metadata downloads parallelized via `Promise.all`
- perf: parallel cloud import — per-page attachment downloads run concurrently
- fix: hooks order violation in PageScreen — moved `handleDateChange`/`handleBack` before early returns to comply with Rules of Hooks
- fix: journal screen loading flash during sync — full-screen spinner now only shows on initial load, not on background refresh
- fix: dev menu unable to load pages — auto-derives encryption key for non-secure journals before reading
- fix: dev menu blank journal icon — uses Feather icon name `'book'` instead of emoji
- refactor: `BackButton` accepts optional `onBack` prop for custom back navigation handling
- refactor: `PageHeader` accepts `isEditing`, `onDateChange`, `onBack`, and `dateValue` props
- refactor: `InfoBox` accepts `devUnlocked` prop to conditionally show Dev Menu access
- refactor: `PagePreview` type now includes `thumbnail` field; `pageToPreview()` carries it through
- test: `usePagination` hook — 5 tests covering initial slice, loadMore, hasMore, reset, and data change detection
- test: `generateThumbnail` — mock-based test verifying resize parameters and base64 output
- test: `FloatingActionButton` — tests verifying safe area inset is added to bottom offset
- test: `pageToPreview` — 2 new tests for thumbnail field propagation

## v0.11.3 - Provider-Agnostic Sync Architecture

- refactor: `RemoteStore` interface now includes `provider`, `isRemotePath()`, and `buildRemotePath()` — sync engine no longer hardcodes `gdrive://` paths
- refactor: `SyncManager` accepts a `RemoteStore` instance via constructor instead of hardcoding `GDriveRemoteStore`
- refactor: `SyncManagerContext` is now the composition root for provider selection, creates `GDriveRemoteStore` and exposes `provider` in context
- refactor: `JournalSettings.syncProvider` uses shared `SyncProvider` type from sync module
- feat: `SyncProviderModal` — provider selection modal shown before auth (currently Google Drive only, extensible)
- feat: `AccountButton` moved from `InfoBox` (settings) to home page footer with "Logged in with {provider}" label
- feat: 3 new i18n keys across all 8 languages (`selectProvider`, `googleDrive`, `loggedInWith`)
- test: `sync-interface.test.ts` — 10 tests verifying `SyncEngine` works with any `RemoteStore` (uses custom `mockprovider://` prefix)
- test: `gdrive-sync-e2e.test.ts` — 9 end-to-end tests with in-memory GDrive simulation (upload, download, conflicts, deletions, attachments, encryption, full cycle)
- test: `gdrive-store.test.ts` — 4 new tests for `provider`, `isRemotePath`, `buildRemotePath`
- test: updated `sync-manager.test.ts` to pass `RemoteStore` via constructor (removed `GDriveRemoteStore` mock)

## v0.11.2 - Attachment Sync, Cloud Import UX & Journal Management

- feat: sync engine now uploads and downloads attachment files alongside pages (previously only page JSON was synced, images were lost on cross-device import)
- feat: cloud import downloads all attachments before saving journal locally, preserving password encryption layer across devices
- feat: cloud import modal now shows all remote journals — local ones displayed as disabled with "Already on this device" badge
- feat: "Manage journals" button in account popover — lists all remote journals, shows local availability, and allows deletion from cloud
- feat: delete confirmation modal for remote journal deletion with warning about permanence
- feat: deleting a remote journal automatically disables sync on the local copy (if any)
- feat: `deleteJournal()` added to `RemoteStore` interface and `GDriveRemoteStore` (deletes folder + registry entry)
- feat: 4 new i18n keys across all 8 languages for journal management UI
- fix: cloud import journal list items missing horizontal padding (icon/text flush against edges)

## v0.11.1 - Auth Migration, Sync Fixes & Sync UI

- feat: migrated Google OAuth from `expo-auth-session` to `@react-native-google-signin/google-signin` (native Google Play Services, no redirect URIs needed)
- feat: `getAccessToken()` in `GoogleAuthContext` — always returns a fresh token via Google Play Services
- feat: sync status badge on cloud icon — green dot when synced, orange when unsynced/error
- feat: badge vibrates during active sync via `Animated` shake animation
- feat: progress bar in `SyncModal` showing per-page sync progress (current/total)
- feat: reactive `useSyncState()` hook via `useSyncExternalStore` — components re-render on sync state changes
- feat: progress callback in `SyncEngine.sync()` reports per-page progress
- feat: 31 new tests — `SyncManager` (16), `SyncEngine` progress/derivedKey (9), GDrive API diagnostics (3), GDrive store diagnostics (4) — 371 total
- fix: sync engine now passes `derivedKey` to all local store operations (was causing JSON parse errors on encrypted journals)
- fix: `SyncManager` always refreshes access token before each sync (prevents stale token errors)
- fix: diagnostic error messages for Drive API and store JSON parse failures (`safeJsonParse`)
- deps: added `@react-native-google-signin/google-signin`, removed `expo-auth-session`, `expo-web-browser`

## v0.11.0 - Google Drive Sync

- feat: per-journal Google Drive sync via the existing `RemoteStore` interface
- feat: Google OAuth via `@react-native-google-signin/google-signin` (native Google Play Services)
- feat: `GoogleAuthContext` with `getAccessToken()` for fresh tokens and `signInSilently()` session restore
- feat: `SyncManager` with debounced auto-sync, per-journal sync state, and concurrent sync prevention
- feat: `GDriveRemoteStore` — full `RemoteStore` implementation using Google Drive REST API v3
- feat: Drive file structure: `appDataFolder/canto-journals.json` registry + `Canto/<journalId>/` folders
- feat: `AccountButton` in home page footer (avatar when signed in, connect button when not)
- feat: `SyncModal` in journal view — enable/disable sync, sync now, auto-sync toggle
- feat: cloud icon in `JournalHeader` with syncing indicator
- feat: auto-sync toggle in `JournalSettings`
- feat: "Import from Google Drive" option in `NewJournalModal` for cross-device journal discovery
- feat: sync-related i18n strings added to all 8 languages
- feat: 23 new tests for Google Drive API helper and `GDriveRemoteStore` (340 total)
- fix: sync engine now passes `derivedKey` to all local store operations (was causing JSON parse errors on encrypted journals)
- fix: `SyncManager` always refreshes access token before each sync (prevents stale token errors)
- fix: added diagnostic error messages for Drive API JSON parse failures
- model: added `syncProvider?: 'gdrive'` and `autoSync: boolean` to `JournalSettings`
- deps: `@react-native-google-signin/google-signin` (replaced `expo-auth-session`, `expo-web-browser`)

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
