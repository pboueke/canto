import { createContext, useContext } from 'react';
import { type CantoTheme, type ThemeName, lightTheme } from '@/styles/themes';

export interface ThemeContextValue {
  theme: CantoTheme;
  setThemeName: (name: ThemeName) => void;
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  setThemeName: () => {},
  isDark: false,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
