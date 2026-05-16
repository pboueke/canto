import { createContext, useContext } from 'react';
import type { FontFamily, FontSize } from '@/lib/font';

export interface FontPrefsContextValue {
  fontSize: FontSize;
  fontFamily: FontFamily;
  setFontSize: (size: FontSize) => void;
  setFontFamily: (family: FontFamily) => void;
}

export const FontPrefsContext = createContext<FontPrefsContextValue>({
  fontSize: 'default',
  fontFamily: 'default',
  setFontSize: () => {},
  setFontFamily: () => {},
});

export function useFontPrefs(): FontPrefsContextValue {
  return useContext(FontPrefsContext);
}
