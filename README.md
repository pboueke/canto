# Canto

A private, encrypted journaling app for Android, iOS, and Web.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.8.0-green)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS%20%7C%20Web-lightgrey)

## Features

- **Application-level encryption** — two-tier AES-256-GCM with PBKDF2 key derivation
- **Multiple journals** — each with optional password protection
- **Markdown** — write entries in markdown with live preview
- **Attachments** — images, files, GPS locations, tags and comments per entry
- **Mixed encryption** — encrypt individual attachments within an entry
- **Dark mode** — light and dark themes matching the original color scheme
- **Internationalization** — English and Portuguese
- **Offline-first** — all data stored locally on device
- **Free and open source** — GPLv3

## Screenshots

<!-- TODO: Add screenshots -->

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 10
- [Android Studio](https://developer.android.com/studio) (for Android)
- [Xcode](https://developer.apple.com/xcode/) (for iOS, macOS only)

### Install

```bash
git clone https://github.com/pneto/canto.git
cd canto
npm install
```

### Run

```bash
npm start          # Start Expo dev server
npm run android    # Android emulator
npm run ios        # iOS simulator (macOS)
npm run web        # Web browser
```

## Development

### Quality commands

```bash
npm run lint          # ESLint
npm run typecheck     # TypeScript strict
npm test              # Jest (81 tests)
npm run test:coverage # Coverage report (40% threshold)
npm run audit         # npm audit (production deps)
make check            # lint + typecheck + test
```

### Project structure

```
canto/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout with theme & i18n providers
│   ├── index.tsx           # Home screen (journal list)
│   ├── journal/[id].tsx    # Journal screen (page list)
│   └── page/[id].tsx       # Page screen (entry editor)
├── src/
│   ├── components/         # UI components
│   ├── contexts/           # React contexts (theme, journal key)
│   ├── hooks/              # Custom hooks (useJournals, usePage, etc.)
│   ├── i18n/               # Dictionaries (en, pt)
│   ├── lib/                # Encryption, storage, sync engine
│   ├── models/             # TypeScript types and data models
│   ├── styles/             # Theme definitions (light, dark)
│   └── assets/             # Fonts, images
└── .husky/                 # Git hooks (pre-commit, pre-push)
```

## Architecture

### Encryption

Canto uses a two-tier encryption model:

1. **Device layer** — AES-256-GCM key stored in the OS secure store (`expo-secure-store`). All journal data is encrypted at rest.
2. **Password layer** (optional) — PBKDF2-SHA256 (600k iterations) derives a second AES-256-GCM key from the user's password. Applied on top of the device layer for password-protected journals.

Cryptographic primitives from [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) and [@noble/hashes](https://github.com/paulmillr/noble-hashes) — audited, zero-dependency libraries.

### Storage

Local storage uses `expo-file-system` with a structured directory layout. Each journal and its pages are stored as encrypted JSON files. Attachments (images, files) are stored alongside entries with optional per-file encryption.

A sync engine interface is defined for future remote backup support (Google Drive, Dropbox, WebDAV) using last-write-wins conflict resolution.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Ensure quality gates pass: `make check`
5. Open a pull request

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) and [@noble/hashes](https://github.com/paulmillr/noble-hashes) for cryptographic primitives
- [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/) for the cross-platform framework
- The original Canto app (tag 0.0.0) for design inspiration
