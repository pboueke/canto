# Canto

A private, encrypted journaling app for Android, iOS, and Web.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.18.6-green)
![Tests](https://img.shields.io/badge/tests-851%2F851%20passed-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20Web-lightgrey)

## Features

- **Encrypted at rest** — all data is AES-256-GCM encrypted on your device before it touches the file system. Your entries are unreadable without your key.
- **Not AI training data** — no analytics, no trackers, no crash reporting, no third-party SDKs. Your journal never leaves your device unless you choose to export or sync it.
- **Multiple journals** — organize your writing across separate journals, each with its own optional password and biometric unlock
- **Markdown editor** — write entries in markdown with live preview
- **Rich entries** — attach images, files, GPS locations, tags, and comments to any entry, with optional per-attachment encryption
- **Data portability** — export journals as encrypted `.canto.zip` archives. Import them on another device. No lock-in.
- **Google Drive sync** — optional cross-device sync via your own Google Drive account, encrypted end-to-end with AES-256-GCM
- **10 themes** — Light, Dark, Monokai, Solarized, Nord, Dracula, Everforest, Rosé Pine, One Cyan, Gruvbox
- **Multilingual** — 20 languages and counting
- **Offline-first** — works without an internet connection. All data stored locally.
- **Free and open source** — GPLv3. Read every line. Audit it yourself.

## Screenshots

<!-- TODO: Add screenshots -->

## Getting Started

```bash
git clone https://github.com/pboueke/canto.git
cd canto
make install    # npm install + Gradle patch
make web        # or: make android / make ios
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, setup details, and development workflow.

## Security & Privacy

Canto encrypts all journal data at rest using two-tier AES-256-GCM encryption. Your data never leaves your device unless you explicitly export or sync it.

- **[Security Model](SECURITY.md)** — Threat model, encryption layers, key management, cryptographic dependencies
- **[Privacy Policy](PRIVACY.md)** — What data Canto collects (none), how your data is stored, and your rights

## Data Portability

Canto journals are yours. The journal data model is extracted into [`canto-data`](https://github.com/pboueke/canto-data), an MIT-licensed TypeScript library with zero dependencies. Use it to build your own tools that read, validate, or manipulate Canto journals — no copyleft obligations.

See the [canto-data repository](https://github.com/pboueke/canto-data) for the full data model reference, export format specification, and usage examples.

## Platform Support

| Platform | Status    |
| -------- | --------- |
| Android  | Supported |
| Web      | Supported |
| iOS      | Pending   |

## License

The Canto app is GPLv3 — see [LICENSE](LICENSE).

The [`canto-data`](https://github.com/pboueke/canto-data) library is MIT-licensed separately.
