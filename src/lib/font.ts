import type { CantoTheme } from '@/styles/themes';

export type FontSize = 'small' | 'default' | 'large' | 'xlarge';
export type FontFamily = 'default' | 'dyslexic' | 'serif';

export const FONT_SIZES: FontSize[] = ['small', 'default', 'large', 'xlarge'];
export const FONT_FAMILIES: FontFamily[] = ['default', 'dyslexic', 'serif'];

export const FONT_SCALES: Record<FontSize, number> = {
  small: 0.85,
  default: 1.0,
  large: 1.15,
  xlarge: 1.3,
};

interface ThemeFonts {
  regular: string;
  bold: string;
  light: string;
  italic: string;
  serif: string;
  serifBold: string;
}

const DEFAULT_FONTS: ThemeFonts = {
  regular: 'Lato-Regular',
  bold: 'Lato-Bold',
  light: 'Lato-Light',
  italic: 'Lato-Italic',
  serif: 'Merriweather-Regular',
  serifBold: 'Merriweather-Bold',
};

const DYSLEXIC_FONTS: ThemeFonts = {
  regular: 'OpenDyslexic-Regular',
  bold: 'OpenDyslexic-Bold',
  light: 'OpenDyslexic-Regular',
  italic: 'OpenDyslexic-Italic',
  serif: 'OpenDyslexic-Regular',
  serifBold: 'OpenDyslexic-Bold',
};

const SERIF_FONTS: ThemeFonts = {
  regular: 'Lora-Regular',
  bold: 'Lora-Bold',
  light: 'Lora-Regular',
  italic: 'Lora-Italic',
  serif: 'Lora-Regular',
  serifBold: 'Lora-Bold',
};

const FONT_FAMILY_MAP: Record<FontFamily, ThemeFonts> = {
  default: DEFAULT_FONTS,
  dyslexic: DYSLEXIC_FONTS,
  serif: SERIF_FONTS,
};

export function getFontFamilies(family: FontFamily): ThemeFonts {
  return FONT_FAMILY_MAP[family];
}

export function applyFontPrefs(theme: CantoTheme, family: FontFamily, size: FontSize): CantoTheme {
  const fonts = FONT_FAMILY_MAP[family];
  return {
    ...theme,
    fonts: {
      ...fonts,
      fontScale: FONT_SCALES[size],
    },
  };
}

export function scaleFont(baseSize: number, scale: number): number {
  return Math.round(baseSize * scale * 10) / 10;
}
