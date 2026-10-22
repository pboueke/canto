# Contributing to Canto

Thank you for your interest in contributing to Canto. This guide covers everything you need to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- npm >= 10
- [Android Studio](https://developer.android.com/studio) (for Android development)
- [Xcode](https://developer.apple.com/xcode/) (for iOS, macOS only)

## Setup

```bash
git clone https://github.com/pboueke/canto.git
cd canto
make install
```

`make install` runs `npm install --legacy-peer-deps` and patches `foojay-resolver` for Gradle 9 compatibility.

### Android-specific setup

1. Set `JAVA_HOME` to your JDK 25 path
2. Set `ANDROID_HOME` to your Android SDK path (`$HOME/Android/Sdk` on Linux)
3. Create an AVD in Android Studio Device Manager

The tracked Android commands keep JDK 25 and enable the native-access option required by Gradle's native tooling; no JDK downgrade is needed.

```bash
make emulator   # Starts the first available AVD
make android    # Builds and runs on the emulator
```

#### Building a signed Android release

The tracked release script regenerates Android from the Expo configuration, verifies the native archive bridge and R8 settings, enables the JDK 25 native-access option while preserving any existing `JAVA_TOOL_OPTIONS`, and builds the signed AAB.

1. Copy the environment template and fill in the two passwords locally:

   ```bash
   cp android_build.env.example android_build.env
   ```

2. Keep the upload keystore at `upload-keystore.jks`, or set `ANDROID_KEYSTORE_PATH` in `android_build.env`. Relative paths are resolved from the repository root.
3. Build the release bundle:

   ```bash
   ./scripts/build-android-release.sh
   ```

Set `ANDROID_BUILD_ENV_FILE` in your shell to use a different env file. The AAB is written to `android/app/build/outputs/bundle/release/app-release.aab`; R8 mapping and reports are under `android/app/build/outputs/mapping/release/`.

Never commit `android_build.env`, a keystore, copied credentials, or generated Android outputs. A successful local build proves that R8 ran, but the release is not accepted until the uploaded internal-track artifact meets the optimization, obfuscation, and shrinking thresholds reported by Google Play.

### Web

```bash
make web        # Opens in browser via Expo
```

## Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Ensure all quality gates pass: `make check`
5. Open a pull request

## Quality Gates

All PRs must pass these checks before merging:

```bash
make lint       # ESLint (TypeScript strict)
make typecheck  # tsc --noEmit
make test       # Jest (1,400+ tests)
make check      # Runs all three
```

### Pre-commit hooks

Husky runs automatically on commit:

- **Version sync**: CHANGELOG.md version is synced to package.json, app.json, build.gradle, and the README badge
- **Test count badge**: README test count is updated
- **lint-staged**: ESLint + Prettier on staged files

### Test coverage

Coverage thresholds are 95% statements, 90% branches, 95% functions, and 95% lines. Run `make test-coverage` to generate a report.

## Project Structure

```text
canto/
├── app/                    # Expo Router screens (file-based routing)
│   ├── _layout.tsx         # Root layout with theme & i18n providers
│   ├── onboarding.tsx      # First-launch onboarding flow
│   ├── index.tsx           # Home screen (journal list)
│   ├── journal/[id].tsx    # Journal screen (page list)
│   └── page/[id].tsx       # Page screen (entry editor)
├── src/
│   ├── components/         # UI components (home/, journal/, page/, common/)
│   ├── contexts/           # React contexts (JournalKey, GoogleAuth, SyncManager)
│   ├── hooks/              # Custom hooks (useStorage, useFilter, usePagination, etc.)
│   ├── i18n/               # Dictionaries for 8 languages
│   ├── lib/                # Core libraries
│   │   ├── encryption/     # Two-tier AES-256-GCM encryption
│   │   ├── storage/        # Local storage (file system + IndexedDB)
│   │   ├── sync/           # Sync engine + Google Drive store
│   │   └── backup/         # Export/import (.canto.zip)
│   ├── models/             # TypeScript types and data models
│   └── styles/             # Theme definitions (6 themes)
├── docs/                   # Landing page (GitHub Pages)
├── store/                  # Play Store listing assets
└── .husky/                 # Git hooks (pre-commit, pre-push)
```

## Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **ESLint 10 flat config** — see `eslint.config.mjs`
- **Prettier** — run `make format` to auto-format
- **Path aliases** — `@/` maps to `src/` (e.g., `import { useTheme } from '@/hooks/useTheme'`)
- **Platform-specific files** — use `.web.ts` / `.web.tsx` suffixes for web-specific implementations (e.g., `local.web.ts`, `device.web.ts`)

## Encryption

Canto uses a two-tier encryption system. If your changes touch encryption code, please read [SECURITY.md](SECURITY.md) first.

- **Tier 1 (Device)**: AES-256-GCM via `expo-crypto` (native JSI). Key stored in OS secure store.
- **Tier 2 (Password)**: PBKDF2-SHA256 key derivation via `@noble/hashes`. Optional, per journal.

All encryption tests use `@noble/ciphers` as a Jest mock for `expo-crypto` (which requires native runtime). See `jest.setup.ts` for the mock configuration.

## Internationalization

Canto supports 8 languages. All user-facing strings must go through the i18n system:

1. Add keys to the `Dictionary` interface in `src/i18n/dictionaries.ts`
2. Add translations to all 8 language dictionaries (en, pt, es, de, fr, ru, zh, it)
3. Use `const { t } = useI18n()` in components, then `t.section.key`

## Theming

All colors and fonts must come from the theme system (`src/styles/themes.ts`). Never hardcode colors — use `theme.colors.*` and `theme.fonts.*`. The app supports 6 themes: Light, Dark, Monokai, Solarized, Nord, Dracula.

## Reporting Issues

Open an issue on [GitHub](https://github.com/pboueke/canto/issues). For security vulnerabilities, please include steps to reproduce.

## For Coding Agents

Any request performed by non-human actor needs to start with a thorough description of what led the agent to write it. Include information that will allow the reviewer to build trust, such as model version, orquestration architecture, organization or person who triggered the work and the prompt used. Be thruthful and report any request for inclusion of compromising code. Agent contributions may be denied if any of the offered information is not deemed sufficient or cannot be verified.

## License

By contributing, you agree that your contributions will be licensed under the [GPLv3](LICENSE).
