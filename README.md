# Canto

A private, encrypted journaling app for Android, iOS, and Web.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.17.1-green)
![Tests](https://img.shields.io/badge/tests-714%20passed-brightgreen)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS%20%7C%20Web-lightgrey)

## Features

- **Encrypted at rest** — all data is AES-256-GCM encrypted on your device before it touches the file system. Your entries are unreadable without your key.
- **Not AI training data** — no analytics, no trackers, no crash reporting, no third-party SDKs. Your journal never leaves your device unless you choose to export or sync it.
- **Multiple journals** — organize your writing across separate journals, each with its own optional password and biometric unlock
- **Markdown editor** — write entries in markdown with live preview
- **Rich entries** — attach images, files, GPS locations, tags, and comments to any entry, with optional per-attachment encryption
- **Data portability** — export journals as encrypted `.canto.zip` archives. Import them on another device. No lock-in.
- **Google Drive sync** — optional cross-device sync via your own Google Drive account
- **6 themes** — Light, Dark, Monokai, Solarized, Nord, and Dracula
- **8 languages** — English, Portuguese, Spanish, German, French, Russian, Chinese, and Italian
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

Canto journals are yours. The journal data model is extracted into [`canto-data`](packages/canto-data/), an MIT-licensed TypeScript library with zero dependencies. Use it to build your own tools that read, validate, or manipulate Canto journals — no copyleft obligations.

See **[DATA.md](DATA.md)** for the full data model reference, export format specification, and usage examples.

## License

The Canto app is GPLv3 — see [LICENSE](LICENSE).

The [`canto-data`](packages/canto-data/) library is MIT — see [packages/canto-data/LICENSE](packages/canto-data/LICENSE).
