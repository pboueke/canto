import { lightTheme } from '@/styles/themes';
import { FONT_SCALES, applyFontPrefs, getFontFamilies, scaleFont } from '../font';

describe('FONT_SCALES', () => {
  it('has the four documented multipliers', () => {
    expect(FONT_SCALES.small).toBe(0.85);
    expect(FONT_SCALES.default).toBe(1.0);
    expect(FONT_SCALES.large).toBe(1.15);
    expect(FONT_SCALES.xlarge).toBe(1.3);
  });
});

describe('getFontFamilies', () => {
  it('returns Lato/Merriweather for default', () => {
    const f = getFontFamilies('default');
    expect(f.regular).toBe('Lato-Regular');
    expect(f.serif).toBe('Merriweather-Regular');
  });

  it('returns OpenDyslexic for dyslexic', () => {
    const f = getFontFamilies('dyslexic');
    expect(f.regular).toBe('OpenDyslexic-Regular');
    expect(f.bold).toBe('OpenDyslexic-Bold');
    expect(f.italic).toBe('OpenDyslexic-Italic');
  });

  it('returns Lora for serif', () => {
    const f = getFontFamilies('serif');
    expect(f.regular).toBe('Lora-Regular');
    expect(f.serif).toBe('Lora-Regular');
  });
});

describe('applyFontPrefs', () => {
  it('swaps the theme fonts and sets fontScale', () => {
    const result = applyFontPrefs(lightTheme, 'dyslexic', 'large');
    expect(result.fonts.regular).toBe('OpenDyslexic-Regular');
    expect(result.fonts.fontScale).toBe(1.15);
    expect(result.colors).toBe(lightTheme.colors);
  });

  it('default + default leaves the original Lato fonts but adds scale 1.0', () => {
    const result = applyFontPrefs(lightTheme, 'default', 'default');
    expect(result.fonts.regular).toBe('Lato-Regular');
    expect(result.fonts.fontScale).toBe(1.0);
  });
});

describe('scaleFont', () => {
  it('multiplies base by scale and rounds to one decimal', () => {
    expect(scaleFont(14, 1.0)).toBe(14);
    expect(scaleFont(14, 1.15)).toBe(16.1);
    expect(scaleFont(14, 0.85)).toBe(11.9);
  });
});
