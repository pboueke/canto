# Changelog

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
