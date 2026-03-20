# TODOs

## Post-Launch

### iOS App Store submission

Submit Canto to the Apple App Store. Expo + EAS Build already supports iOS. `app.json` has `ios.bundleIdentifier: com.canto.app`. Main blockers: Apple developer account ($99/year) + device testing.
**Depends on**: Play Store launch (validate the process on Android first).

### CI/CD pipeline

Set up GitHub Actions to run `make check` (lint + typecheck + test) on push/PR. Optionally build APK via EAS Build. Enables contributor PR validation and builds trust with FOSS community.

### Open journal format specification (.canto)

Document the Canto journal file format (directory structure, encryption scheme, metadata schema) as a versioned open standard. The export format (`.canto.zip`) already exists in `src/lib/backup/export.ts` — the spec would formalize what's already implemented. Start with a v0.1 draft.
**Depends on**: Play Store launch (get users first, then formalize).

### Monetization infrastructure

Implement the paid tier — support license with extended customization options (custom themes, fonts, journal templates). Either via Play Store in-app purchase or a separate license key system.
**Depends on**: Play Store launch + initial user feedback on what users value.

### Design system (DESIGN.md)

Formalize the design system (fonts, colors, spacing, components) into a DESIGN.md. Currently, design patterns are implicit in the codebase (Lato/Merriweather fonts, teal/mint palette, borderRadius 5, Card component). Run `/design-consultation` to create.
