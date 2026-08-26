import {
  importNativeJournal,
  MAX_LEGACY_ENCRYPTED_ENTRY_BYTES,
} from '../backup/native-importer.web';

describe('native importer web boundary', () => {
  it('keeps the Android-only importer out of the browser bundle', async () => {
    expect(MAX_LEGACY_ENCRYPTED_ENTRY_BYTES).toBe(32 * 1024 * 1024);
    await expect(importNativeJournal('blob:backup', 'Imported')).rejects.toThrow(
      'Native archive import is unavailable on web',
    );
  });
});
