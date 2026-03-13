import { dictionaries } from '../dictionaries';

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
    ];
    for (const key of expectedKeys) {
      expect(dictionaries.en.common).toHaveProperty(key);
      expect(dictionaries.pt.common).toHaveProperty(key);
    }
  });
});
