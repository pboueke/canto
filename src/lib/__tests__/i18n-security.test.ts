import { dictionaries, type LangCode } from '@/i18n/dictionaries';

const ALL_LANGS = Object.keys(dictionaries) as LangCode[];
const EN_SECURITY = dictionaries.en.security;

describe('i18n — security section', () => {
  it('all languages have security section', () => {
    expect(ALL_LANGS.length).toBeGreaterThanOrEqual(8);
    for (const lang of ALL_LANGS) {
      expect(dictionaries[lang].security).toBeDefined();
    }
  });

  it('all security keys present in every language', () => {
    const enKeys = Object.keys(EN_SECURITY);
    for (const lang of ALL_LANGS) {
      const secKeys = Object.keys(dictionaries[lang].security);
      for (const k of enKeys) {
        expect(secKeys).toContain(k);
      }
    }
  });

  it('kdf sub-object has all 6 presets', () => {
    for (const lang of ALL_LANGS) {
      const kdf = dictionaries[lang].security.kdf;
      expect(kdf).toHaveProperty('fast');
      expect(kdf).toHaveProperty('improved');
      expect(kdf).toHaveProperty('moderate');
      expect(kdf).toHaveProperty('strong');
      expect(kdf).toHaveProperty('great');
      expect(kdf).toHaveProperty('extreme');
    }
  });

  it('no empty strings in security section', () => {
    for (const lang of ALL_LANGS) {
      const sec = dictionaries[lang].security;
      for (const [, value] of Object.entries(sec)) {
        if (typeof value === 'string') {
          expect(value.length).toBeGreaterThan(0);
        } else if (typeof value === 'object') {
          for (const [, subValue] of Object.entries(value)) {
            expect((subValue as string).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

// The storage-integrity/recovery states and the classified export failures are
// user-facing contract surfaces: they must stay localized in every language,
// never falling back to an English-only or empty string.
describe('i18n — recovery states and classified export errors', () => {
  const RECOVERY_KEYS = [
    'title',
    'message',
    'deviceKeyDetail',
    'indexDetail',
    'instructions',
  ] as const;
  const EXPORT_ERROR_KEYS = [
    'exportError',
    'exportErrorData',
    'exportErrorArchive',
    'exportErrorShare',
  ] as const;

  it('every language defines and localizes the recovery section', () => {
    for (const lang of ALL_LANGS) {
      const recovery = dictionaries[lang].recovery;
      expect(recovery).toBeDefined();
      for (const key of RECOVERY_KEYS) {
        expect(typeof recovery[key]).toBe('string');
        expect(recovery[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('every language localizes the classified export error messages', () => {
    for (const lang of ALL_LANGS) {
      const backup = dictionaries[lang].backup;
      for (const key of EXPORT_ERROR_KEYS) {
        expect(typeof backup[key]).toBe('string');
        expect(backup[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('every language localizes the locked-save message', () => {
    for (const lang of ALL_LANGS) {
      expect(typeof dictionaries[lang].page.unlockRequired).toBe('string');
      expect(dictionaries[lang].page.unlockRequired.length).toBeGreaterThan(0);
    }
  });
});

// The opt-in "Recover local pages" tool surfaces storage-integrity outcomes to
// the user; every language must carry the actionable, localized strings and the
// recoverable-count placeholder must survive translation.
describe('i18n — recover local pages tool', () => {
  const RECOVER_KEYS = [
    'recoverLocalPages',
    'recoverDescription',
    'recoverScanning',
    'recoverFound',
    'recoverNone',
    'recoverConfirm',
    'recoverRestoring',
    'recoverSuccess',
    'recoverIncomplete',
    'recoverLocked',
    'recoverFailed',
  ] as const;

  it('every language localizes the recovery tool strings', () => {
    for (const lang of ALL_LANGS) {
      const settings = dictionaries[lang].journalSettings;
      for (const key of RECOVER_KEYS) {
        expect(typeof settings[key]).toBe('string');
        expect(settings[key].length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the recoverable-count placeholder in every language', () => {
    for (const lang of ALL_LANGS) {
      expect(dictionaries[lang].journalSettings.recoverFound).toContain('{count}');
    }
  });
});
