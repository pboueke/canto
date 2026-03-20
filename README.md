# Canto

A private, encrypted journaling app for Android, iOS, and Web.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.15.0-green)
![Tests](https://img.shields.io/badge/tests-588%20passed-brightgreen)
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
npm test              # Jest (588 tests)
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

## Security & Privacy

Canto encrypts all journal data at rest using two-tier AES-256-GCM encryption. Your data never leaves your device unless you explicitly export or sync it. No analytics, no trackers, no data collection.

- **[Security Model](SECURITY.md)** — Full technical details: encryption layers, key management, threat model, cryptographic dependencies
- **[Privacy Policy](PRIVACY.md)** — What data Canto collects (none), how your data is stored, and your rights

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style, and development workflow.

## License

This project is licensed under the GNU General Public License v3.0 — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [`expo-crypto`](https://docs.expo.dev/versions/latest/sdk/crypto/) for native AES-GCM encryption
- [`@noble/hashes`](https://github.com/paulmillr/noble-hashes) for PBKDF2 key derivation
- [Expo](https://expo.dev/) and [React Native](https://reactnative.dev/) for the cross-platform framework
- The original Canto app (tag 0.0.0) for design inspiration
