# Canto

A private, encrypted journaling app for Android, iOS, and Web.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.11.0-green)
![Tests](https://img.shields.io/badge/tests-340%20passed-brightgreen)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS%20%7C%20Web-lightgrey)

## Features

- **Application-level encryption** — two-tier AES-256-GCM with PBKDF2 key derivation
- **Multiple journals** — each with optional password protection and biometric unlock
- **Markdown** — write entries in markdown with live preview
- **Attachments** — images, files, GPS locations, tags and comments per entry
- **Mixed encryption** — encrypt individual attachments within an entry
- **Backup & import** — export journals as encrypted `.canto.zip` archives
- **Themes** — Light, Dark, Monokai, Solarized, Nord, and Dracula
- **Internationalization** — English, Portuguese, Spanish, German, French, Russian, Chinese, and Italian
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
git clone https://github.com/pboueke/canto.git
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
npm test              # Jest (340 tests)
npm run test:coverage # Coverage report (80% threshold)
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
│   ├── i18n/               # Dictionaries (en, pt, es, de, fr, ru, zh, it)
│   ├── lib/                # Encryption, storage, backup, sync engine
│   ├── models/             # TypeScript types and data models
│   ├── styles/             # Theme definitions (6 themes)
│   └── assets/             # Fonts, images
└── .husky/                 # Git hooks (pre-commit, pre-push)
```

## Security Model

Canto encrypts all journal data at rest using a two-tier architecture.

### Encryption layers

1. **Device layer** (always active) — A 256-bit AES-GCM key is generated on first launch and stored in the OS secure store (`expo-secure-store`). All data written to disk is encrypted with this key via native `expo-crypto` (JSI). The key never leaves the device.

2. **Password layer** (optional, per journal) — When a journal is password-protected, a second AES-256-GCM key is derived from the user's password using PBKDF2-SHA256 with configurable iterations (50k–1M). Data is first encrypted with the password-derived key, then with the device key.

### Key management

- **Device key** is stored in `expo-secure-store` (hardware-backed keychain on iOS, Android Keystore on Android). It can be rotated — all data is re-encrypted atomically.
- **Password-derived keys** are cached in memory during a session and zeroed (`fill(0)`) on lock/timeout. JavaScript GC limitations mean this is best-effort (per OWASP guidance).
- **Biometric gate** — Journals can optionally require biometric authentication (`expo-local-authentication`) before the key cache is accessed.

### Session security

- **Auto-lock** — Derived keys are cleared after a configurable inactivity timeout (1 min / 5 min / 15 min / off). Both foreground inactivity and background-to-foreground transitions are monitored.
- **Rate limiting** — Failed password attempts trigger exponential backoff: 30 s after 5 attempts, 5 min after 10, 30 min after 15.

### Backup encryption

Exported `.canto.zip` archives are encrypted with a user-supplied password via PBKDF2 + AES-256-GCM. The archive contains encrypted journal metadata, pages, and attachments. On import, the password is verified in two phases (metadata first, then full content).

### Cryptographic dependencies

- [`expo-crypto`](https://docs.expo.dev/versions/latest/sdk/crypto/) — Native AES-256-GCM encryption via JSI
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) — PBKDF2-SHA256 key derivation (audited, zero-dependency)

### Storage

Local storage uses `expo-file-system` with a structured directory layout. Each journal and its pages are stored as encrypted JSON files. Attachments (images, files) are stored alongside entries with optional per-file encryption. File writes use an atomic temp-file pattern to prevent corruption.

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

- [`expo-crypto`](https://docs.expo.dev/versions/latest/sdk/crypto/) for native AES-GCM encryption
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) for PBKDF2 key derivation
- [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/) for the cross-platform framework
- The original Canto app (tag 0.0.0) for design inspiration
