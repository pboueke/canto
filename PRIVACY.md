# Privacy Policy

**Effective date**: 2026-03-20
**App**: Canto — Private Journal
**Developer**: Pedro Boueke
**Contact**: https://github.com/pboueke/canto/issues

## Summary

Canto does not collect, store, transmit, or sell any personal data. Your journal entries are encrypted on your device and never leave it unless you explicitly choose to export or sync them.

## Data Storage

All journal data (entries, attachments, metadata) is stored locally on your device using:

- **Android/iOS**: The device file system, encrypted with AES-256-GCM
- **Web**: IndexedDB in your browser, encrypted with AES-256-GCM

Your data is not stored on any server operated by Canto or its developer.

## Encryption

Canto encrypts all data at rest using AES-256-GCM encryption:

- A device-level encryption key is generated on first launch and stored in your device's secure store (Android Keystore / iOS Keychain)
- Optionally, journals can be further protected with a user-chosen password via PBKDF2-SHA256 key derivation

For full technical details, see [SECURITY.md](SECURITY.md).

## Data Collection

Canto collects **none** of the following:

- Personal information (name, email, phone number)
- Usage analytics or telemetry
- Crash reports
- Device identifiers
- Location data (GPS is only used locally for journal entry tagging, if you enable it)
- Advertising identifiers

**Canto contains no ads, no trackers, and no third-party analytics SDKs.**

## Network Access

Canto makes network requests **only** when you explicitly initiate them:

### Google Drive Sync (optional)

If you choose to enable Google Drive sync:

- Canto authenticates with your Google account using the standard Google Sign-In flow
- Your journal data is stored in your own Google Drive account, in an app-specific folder
- Canto can only access its own folder — it cannot read your other Google Drive files
- **All journal content (pages, metadata, attachments) is encrypted with AES-256-GCM before upload** — no plain-text journal content is stored on Google Drive, regardless of whether the journal is password-protected or not
- A small amount of non-content metadata remains unencrypted for sync coordination: journal titles, page IDs (UUIDs), and modification timestamps. These are stored in Google Drive's hidden app-private space or as structural metadata
- You can disable sync and delete the remote copy at any time

For full technical details on sync encryption, see [SECURITY.md](SECURITY.md#google-drive-sync).

### No Other Network Activity

Canto does not:

- Phone home or check for updates
- Send crash reports
- Contact any analytics service
- Make any background network requests

## Biometric Data

If you enable biometric unlock for a journal:

- Canto uses the device's biometric API (`expo-local-authentication`) to verify your identity
- Biometric data (fingerprint, face scan) is processed entirely by the operating system
- Canto never accesses, stores, or transmits biometric data

## Data Portability

You can export all your data at any time:

- **Backup export**: Creates an encrypted `.canto.zip` archive containing all entries and attachments
- **The exported file belongs to you** — store it wherever you want, import it on another device, or use it as a backup

## Data Deletion

- Delete individual entries, pages, or entire journals from within the app
- Uninstalling the app removes all local data
- If you used Google Drive sync, you can delete the remote copy from within the app or directly from Google Drive

## Children's Privacy

Canto does not knowingly collect any data from children under 13 (or the applicable age in your jurisdiction), because Canto does not collect any data from anyone.

## Third-Party Services

The only third-party service Canto integrates with is **Google Drive** (optional sync). Google's privacy policy applies to data stored in your Google Drive account: https://policies.google.com/privacy

## Open Source

Canto is open source under the GPLv3 license. You can verify every claim in this privacy policy by reading the source code: https://github.com/pboueke/canto

## Changes to This Policy

If this privacy policy changes, the updated version will be published in the GitHub repository and included in the app's next release. The effective date at the top of this document will be updated.

## Contact

For questions about this privacy policy, open an issue on the GitHub repository: https://github.com/pboueke/canto/issues
