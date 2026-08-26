import { dictionaries, langCodes } from '../dictionaries';

function dictionaryKeyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => dictionaryKeyPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('Dictionaries', () => {
  it('has English and Portuguese translations', () => {
    expect(dictionaries.en).toBeDefined();
    expect(dictionaries.pt).toBeDefined();
  });

  it('English has app name Canto', () => {
    expect(dictionaries.en.app.name).toBe('Canto');
  });

  it('Portuguese has app name Canto', () => {
    expect(dictionaries.pt.app.name).toBe('Canto');
  });

  it('both languages have the same keys', () => {
    const enKeys = Object.keys(dictionaries.en);
    const ptKeys = Object.keys(dictionaries.pt);
    expect(enKeys).toEqual(ptKeys);
  });

  it('common section has all expected keys', () => {
    const expectedKeys = [
      'cancel',
      'save',
      'delete',
      'edit',
      'create',
      'open',
      'close',
      'search',
      'settings',
      'loading',
      'confirm',
      'done',
    ];
    for (const key of expectedKeys) {
      expect(dictionaries.en.common).toHaveProperty(key);
      expect(dictionaries.pt.common).toHaveProperty(key);
    }
  });

  it('has journalSettings section in both languages', () => {
    const expectedKeys = [
      'title',
      'stats',
      'pageCount',
      'createdOn',
      'displaySettings',
      'use24h',
      'previewTags',
      'previewThumbnail',
      'previewIcons',
      'filterBarToggle',
      'autoLocation',
      'sortOrder',
      'ascending',
      'descending',
      'none',
      'changeIcon',
      'changeName',
      'newName',
      'changePassword',
      'currentPassword',
      'newPassword',
      'confirmNewPassword',
      'removePassword',
      'removePasswordHint',
      'passwordChanged',
      'passwordRemoved',
      'passwordAdded',
      'dangerZone',
      'deleteJournal',
      'deleteConfirmSecure',
      'typeToDelete',
      'reencrypting',
      'reencryptProgress',
    ];
    for (const key of expectedKeys) {
      expect(dictionaries.en.journalSettings).toHaveProperty(key);
      expect(dictionaries.pt.journalSettings).toHaveProperty(key);
    }
  });

  it('has filterBar section in both languages', () => {
    const expectedKeys = [
      'searchPlaceholder',
      'from',
      'to',
      'clearFilters',
      'hasImage',
      'hasFile',
      'hasLocation',
      'tags',
      'filterBy',
      'noTagsAvailable',
    ];
    for (const key of expectedKeys) {
      expect(dictionaries.en.filterBar).toHaveProperty(key);
      expect(dictionaries.pt.filterBar).toHaveProperty(key);
    }
  });

  it('all sub-sections have matching keys between languages', () => {
    for (const section of Object.keys(dictionaries.en) as (keyof typeof dictionaries.en)[]) {
      const enKeys = Object.keys(dictionaries.en[section]).sort();
      const ptKeys = Object.keys(dictionaries.pt[section]).sort();
      expect(enKeys).toEqual(ptKeys);
    }
  });

  it('keeps every supported language structurally complete', () => {
    const englishPaths = dictionaryKeyPaths(dictionaries.en);
    for (const language of langCodes) {
      expect(dictionaryKeyPaths(dictionaries[language])).toEqual(englishPaths);
    }
  });
});
