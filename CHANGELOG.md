# Changelog

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
