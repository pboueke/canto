import { createContext, useContext } from 'react';
import { type CantoTheme, lightTheme } from '@/styles/themes';

export interface ThemeContextValue {
  theme: CantoTheme;
  toggleTheme: () => void;
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  toggleTheme: () => {},
  isDark: false,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
