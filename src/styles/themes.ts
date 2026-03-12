export interface CantoTheme {
  name: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    primary: string;
    accent: string;
    border: string;
    error: string;
    success: string;
    buttonSubmit: string;
    buttonCancel: string;
    buttonDisabled: string;
    cardBackground: string;
    tag: {
      default: string;
      active: string;
      text: string;
    };
    markdown: {
      text: string;
      background: string;
      codeBackground: string;
      quote: string;
    };
  };
  fonts: {
    regular: string;
    bold: string;
    light: string;
    italic: string;
    serif: string;
    serifBold: string;
  };
}

export const lightTheme: CantoTheme = {
  name: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#1A1A1A',
    textSecondary: '#666666',
    primary: '#E67E22',
    accent: '#1ABC9C',
    border: '#E0E0E0',
    error: '#E74C3C',
    success: '#27AE60',
    buttonSubmit: '#E67E22',
    buttonCancel: '#95A5A6',
    buttonDisabled: '#BDC3C7',
    cardBackground: '#FAFAFA',
    tag: {
      default: '#ECF0F1',
      active: '#E67E22',
      text: '#2C3E50',
    },
    markdown: {
      text: '#1A1A1A',
      background: '#FFFFFF',
      codeBackground: '#F5F5F5',
      quote: '#7F8C8D',
    },
  },
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const darkTheme: CantoTheme = {
  name: 'dark',
  colors: {
    background: '#1A1A2E',
    surface: '#16213E',
    text: '#E0E0E0',
    textSecondary: '#A0A0A0',
    primary: '#E91E63',
    accent: '#1ABC9C',
    border: '#2C3E50',
    error: '#E74C3C',
    success: '#27AE60',
    buttonSubmit: '#E91E63',
    buttonCancel: '#7F8C8D',
    buttonDisabled: '#4A4A4A',
    cardBackground: '#0F3460',
    tag: {
      default: '#2C3E50',
      active: '#E91E63',
      text: '#ECF0F1',
    },
    markdown: {
      text: '#E0E0E0',
      background: '#1A1A2E',
      codeBackground: '#16213E',
      quote: '#A0A0A0',
    },
  },
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
