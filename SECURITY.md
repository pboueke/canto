# Security Model

Canto encrypts all journal data at rest using a two-tier architecture. This document describes how your data is protected, what cryptographic primitives are used, and what the known limitations are.

## Threat Model

Canto is designed to protect your journal data against:

- **Device theft or loss** — All data is encrypted at rest. Without the device key (and optionally your password), stored files are unreadable.
- **File system access** — Even if an attacker gains access to the app's data directory, all journal content is AES-256-GCM ciphertext.
- **Backup interception** — Exported `.canto.zip` archives are independently encrypted with a user-chosen password.
- **Brute-force password attacks** — PBKDF2 key derivation with configurable iterations (50k–1M) and exponential backoff rate limiting.

Canto does **not** protect against:

- **A compromised operating system** — If the OS itself is compromised (e.g., rooted device with malware), the attacker may be able to extract keys from the secure store.
- **Shoulder surfing / screen capture** — Canto does not prevent screenshots or screen recording.
- **Memory forensics** — JavaScript runtime limitations mean key material may persist in memory after `fill(0)` due to garbage collection (per OWASP guidance).

## Encryption Layers

### Tier 1: Device Encryption (always active)

A 256-bit AES-GCM key is generated on first launch and stored in the OS secure store:

- **Android**: Android Keystore (hardware-backed on supported devices)
- **iOS**: Keychain Services (hardware-backed via Secure Enclave)
- **Web**: localStorage (with console security warning — web is inherently less secure)

All data written to disk is encrypted with this key via native `expo-crypto` (JSI bridge). The key never leaves the device and never travels over the network.

**Ciphertext format**: `base64([12-byte nonce][ciphertext][16-byte GCM tag])`

Each encryption operation generates a unique 12-byte nonce using the platform's CSPRNG.

### Tier 2: Password Encryption (optional, per journal)

When a journal is password-protected, a second AES-256-GCM key is derived from the user's password using:

- **Algorithm**: PBKDF2-SHA256
- **Salt**: 16 bytes, cryptographically random, stored alongside the journal metadata
- **Iterations**: User-configurable (50,000 / 100,000 / 200,000 / 600,000 / 800,000 / 1,000,000)

Data is double-encrypted: `plaintext → password encrypt → device encrypt → stored ciphertext`

On decryption, the layers are reversed: `stored ciphertext → device decrypt → password decrypt → plaintext`

## Key Management

### Device Key

- Stored in `expo-secure-store` (backed by OS keychain/keystore)
- Can be **rotated** — all journals, pages, and attachments are re-encrypted atomically with the new key
- Rotation is recommended if the device may have been compromised

### Password-Derived Keys

- Derived from user password + salt via PBKDF2-SHA256
- **Cached in memory** during a session for performance
- **Zeroed** (`Uint8Array.fill(0)`) on lock, timeout, or app background
- JavaScript GC limitations mean this zeroing is best-effort — the runtime may retain copies

### Biometric Gate

Journals can optionally require biometric authentication (`expo-local-authentication`) before the key cache is accessed. Biometrics gate access to the cached key — they do not replace password-based encryption.

## Session Security

### Auto-Lock

Derived keys are cleared from memory after a configurable inactivity timeout:

- 1 minute / 5 minutes / 15 minutes / Off

Both foreground inactivity and background-to-foreground transitions are monitored. When auto-lock triggers, all cached password-derived keys are zeroed and the user must re-authenticate.

### Rate Limiting

Failed password attempts trigger exponential backoff:

- 5 failed attempts → 30 second lockout
- 10 failed attempts → 5 minute lockout
- 15 failed attempts → 30 minute lockout

Rate limit state is stored in memory and resets on app restart.

## Backup Encryption

Exported `.canto.zip` archives are independently encrypted:

1. User provides an export password
2. A key is derived via PBKDF2-SHA256 (same configurable iterations)
3. Journal metadata, pages, and attachments are encrypted with AES-256-GCM
4. The archive is self-contained — it can be imported on any device with the correct password

On import, the password is verified in two phases:

1. Metadata decryption (fast verification that the password is correct)
2. Full content decryption (pages + attachments)

## Storage

Local storage uses `expo-file-system` (native) or IndexedDB (web) with a structured virtual path layout:

- Each journal and its pages are stored as encrypted JSON files
- Attachments (images, files) are stored alongside entries with optional per-file encryption
- File writes use an **atomic temp-file pattern** — data is written to a temporary file first, then renamed, preventing corruption from interrupted writes

## Data Collection

Canto collects **no data**:

- No analytics or telemetry
- No crash reporting
- No usage tracking
- No network requests except user-initiated Google Drive sync
- No third-party SDKs that phone home

Your journal data never leaves your device unless you explicitly choose to:

1. Export a backup (`.canto.zip` file you control)
2. Sync via Google Drive (device encryption is stripped before upload; password-encrypted journals remain encrypted on Google Drive, but journals without a password are stored unencrypted)

## Cryptographic Dependencies

| Library                                                                                              | Purpose                                      | Audit Status                                                                     |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| [`expo-crypto`](https://docs.expo.dev/versions/latest/sdk/crypto/)                                   | AES-256-GCM encryption via native JSI        | Maintained by Expo team                                                          |
| [`@noble/hashes`](https://github.com/paulmillr/noble-hashes)                                         | PBKDF2-SHA256 key derivation                 | [Audited](https://github.com/nicolo-ribaudo/noble-hashes-audit), zero-dependency |
| [`react-native-get-random-values`](https://github.com/nicolo-ribaudo/react-native-get-random-values) | CSPRNG polyfill for `crypto.getRandomValues` | Standard polyfill                                                                |

## Open Source

Canto is licensed under GPLv3. The entire codebase — including all encryption, storage, and sync code — is publicly auditable on [GitHub](https://github.com/pboueke/canto).

If you find a security vulnerability, please report it by opening a GitHub issue or contacting the maintainer directly.
