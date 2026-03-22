/**
 * Tests for all web platform stubs and lightweight web implementations.
 * Ensures correct behavior for:
 * - backup/export.web.ts (throws)
 * - backup/import.web.ts (throws + re-exports)
 * - biometric.web.ts (returns false/null/no-op)
 * - thumbnail.web.ts (pass-through)
 * - styles/web.ts (maxWidth on web)
 * - changelog.web.ts (parseVersionFromChangelog)
 */

// ---------------------------------------------------------------------------
// Backup export web — real implementation (generates ZIP + blob download)
// ---------------------------------------------------------------------------
import type { ExportManifest, ExportProgress } from '../backup/export.web';

describe('backup/export.web', () => {
  it('exports ExportManifest and ExportProgress types', () => {
    const manifest: ExportManifest = {
      version: 1,
      appVersion: '0.14.0',
      exportDate: '2026-01-01',
      encrypted: false,
      journalTitle: 'Test',
    };
    const progress: ExportProgress = { current: 0, total: 1, phase: 'pages' };
    expect(manifest.version).toBe(1);
    expect(progress.phase).toBe('pages');
  });
});

// ---------------------------------------------------------------------------
// Backup import web — real implementation (reads ZIP via fetch)
// ---------------------------------------------------------------------------
import { hasNameConflict, resolveNameConflict } from '../backup/import.web';
import type { ImportResult, ImportInfo, ImportProgress } from '../backup/import.web';

describe('backup/import.web', () => {
  it('re-exports hasNameConflict from conflicts module', () => {
    expect(hasNameConflict('test', ['test'])).toBe(true);
    expect(hasNameConflict('test', ['other'])).toBe(false);
  });

  it('re-exports resolveNameConflict from conflicts module', () => {
    expect(resolveNameConflict('test', ['test'])).toBe('test (copy)');
    expect(resolveNameConflict('test', ['test', 'test (copy)'])).toBe('test (copy 2)');
  });

  it('exports ImportResult, ImportInfo, and ImportProgress types', () => {
    const result: ImportResult = { journalId: 'id', title: 'title' };
    const info: ImportInfo = {
      manifest: {
        version: 1,
        appVersion: '0.14.0',
        exportDate: '2026-01-01',
        encrypted: false,
        journalTitle: 'Test',
      },
      needsPassword: false,
      canProvidePassword: false,
    };
    const progress: ImportProgress = { current: 0, total: 1, phase: 'pages' };
    expect(result.journalId).toBe('id');
    expect(info.needsPassword).toBe(false);
    expect(progress.phase).toBe('pages');
  });
});

// ---------------------------------------------------------------------------
// Biometric stub
// ---------------------------------------------------------------------------
import {
  isBiometricAvailable,
  authenticateBiometric,
  storeBiometricKey,
  getBiometricKey,
  clearBiometricKey,
} from '../biometric.web';

describe('biometric.web', () => {
  it('isBiometricAvailable returns false', async () => {
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('authenticateBiometric returns false', async () => {
    expect(await authenticateBiometric('unlock')).toBe(false);
  });

  it('storeBiometricKey is a no-op', async () => {
    await expect(storeBiometricKey('j1', new Uint8Array(32))).resolves.toBeUndefined();
  });

  it('getBiometricKey returns null', async () => {
    expect(await getBiometricKey('j1')).toBeNull();
  });

  it('clearBiometricKey is a no-op', async () => {
    await expect(clearBiometricKey('j1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Thumbnail stub
// ---------------------------------------------------------------------------
import { generateThumbnail } from '../thumbnail.web';

describe('thumbnail.web', () => {
  it('returns the input base64 unchanged', async () => {
    const input = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAA';
    expect(await generateThumbnail(input)).toBe(input);
  });

  it('handles empty string', async () => {
    expect(await generateThumbnail('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Changelog web — parseVersionFromChangelog is tested in changelog.test.ts
// (same implementation). loadChangelog needs expo-asset mocks which are
// already covered by the existing changelog.test.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Styles web
// ---------------------------------------------------------------------------
import { webModalContent } from '../../styles/web';

describe('styles/web — webModalContent', () => {
  it('is a ViewStyle object', () => {
    expect(typeof webModalContent).toBe('object');
  });

  it('contains maxWidth on web or is empty on native', () => {
    // In Jest (Node), Platform.OS is not 'web', so webModalContent should be empty
    expect(webModalContent).toEqual({});
  });
});
