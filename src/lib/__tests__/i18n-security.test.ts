import { dictionaries, type LangCode } from '@/i18n/dictionaries';

const ALL_LANGS = Object.keys(dictionaries) as LangCode[];
const EN_SECURITY = dictionaries.en.security;

describe('i18n — security section', () => {
  it('all 8 languages have security section', () => {
    expect(ALL_LANGS).toHaveLength(8);
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
