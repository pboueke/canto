export type ThemeName = 'light' | 'dark' | 'monokai' | 'solarized' | 'nord' | 'dracula';

export interface CantoTheme {
  name: ThemeName;
  isDark: boolean;
  colors: {
    background: string;
    surface: string;
    foreground: string;
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
    highlight: string;
    editBar: string;
    deleteAction: string;
    headerBackground: string;
    filterRow: string;
    newJournal: {
      text: string;
      icon: string;
      background: string;
      border: string;
    };
    popAction: {
      save: { background: string; text: string };
      edit: { background: string; text: string };
      new: { background: string; text: string };
      delete: { background: string; text: string };
    };
    tag: {
      default: string;
      active: string;
      text: string;
      add: string;
      remove: string;
    };
    markdown: {
      text: string;
      background: string;
      codeBackground: string;
      quote: string;
    };
    location: {
      text: string;
      background: string;
    };
  };
  borderWidth: number;
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
  isDark: false,
  colors: {
    background: 'rgb(190, 190, 190)',
    surface: 'rgb(240, 240, 240)',
    foreground: 'rgb(255, 255, 255)',
    text: 'rgb(0, 0, 0)',
    textSecondary: 'rgb(50, 50, 50)',
    primary: 'rgb(1, 85, 92)',
    accent: 'rgb(87, 196, 173)',
    border: 'rgb(0, 0, 0)',
    error: 'rgb(255, 0, 0)',
    success: 'green',
    buttonSubmit: 'rgb(0, 0, 0)',
    buttonCancel: 'rgb(252, 212, 210)',
    buttonDisabled: 'rgb(222, 222, 222)',
    cardBackground: 'rgb(255, 255, 255)',
    highlight: 'rgb(240, 240, 240)',
    editBar: 'rgb(232, 202, 51)',
    deleteAction: 'rgb(255, 109, 5)',
    headerBackground: 'rgb(255, 255, 255)',
    filterRow: 'rgb(150, 150, 150)',
    newJournal: {
      text: 'rgb(0, 0, 0)',
      icon: 'rgb(0, 0, 0)',
      background: 'rgb(255, 237, 145)',
      border: 'rgb(0, 0, 0)',
    },
    popAction: {
      save: { background: 'rgb(76, 175, 80)', text: 'rgb(255, 255, 255)' },
      edit: { background: 'rgb(255, 255, 255)', text: 'rgb(0, 0, 0)' },
      new: { background: 'rgb(232, 202, 51)', text: 'rgb(0, 0, 0)' },
      delete: { background: 'rgb(255, 109, 5)', text: 'rgb(0, 0, 0)' },
    },
    tag: {
      default: 'rgb(222, 222, 222)',
      active: 'rgb(200, 200, 200)',
      text: 'rgb(0, 0, 0)',
      add: 'rgb(232, 202, 51)',
      remove: 'rgb(87, 196, 173)',
    },
    markdown: {
      text: 'rgb(0, 0, 0)',
      background: 'rgb(255, 255, 255)',
      codeBackground: 'rgb(222, 222, 222)',
      quote: 'rgb(230, 230, 230)',
    },
    location: {
      text: 'rgb(0, 0, 0)',
      background: 'rgb(222, 222, 222)',
    },
  },
  borderWidth: 2,
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
  isDark: true,
  colors: {
    background: 'rgb(0, 0, 0)',
    surface: 'rgb(70, 70, 70)',
    foreground: 'rgb(40, 40, 40)',
    text: 'rgb(222, 222, 222)',
    textSecondary: 'rgb(150, 150, 150)',
    primary: 'rgb(255, 161, 186)',
    accent: 'rgb(57, 128, 113)',
    border: 'rgb(100, 100, 100)',
    error: 'rgb(255, 109, 5)',
    success: 'rgb(54, 245, 168)',
    buttonSubmit: 'rgb(255, 255, 255)',
    buttonCancel: 'rgb(255, 109, 5)',
    buttonDisabled: 'rgb(50, 50, 50)',
    cardBackground: 'rgb(50, 50, 50)',
    highlight: 'rgb(70, 70, 70)',
    editBar: 'rgb(232, 202, 51)',
    deleteAction: 'rgb(255, 109, 5)',
    headerBackground: 'rgb(25, 25, 25)',
    filterRow: 'rgb(54, 54, 54)',
    newJournal: {
      text: 'rgb(222, 222, 222)',
      icon: 'rgb(222, 222, 222)',
      background: 'rgb(82, 69, 6)',
      border: 'rgb(255, 217, 23)',
    },
    popAction: {
      save: { background: 'rgb(56, 142, 60)', text: 'rgb(255, 255, 255)' },
      edit: { background: 'rgb(50, 50, 50)', text: 'rgb(255, 255, 255)' },
      new: { background: 'rgb(161, 140, 35)', text: 'rgb(0, 0, 0)' },
      delete: { background: 'rgb(255, 109, 5)', text: 'rgb(0, 0, 0)' },
    },
    tag: {
      default: 'rgb(66, 66, 66)',
      active: 'rgb(66, 66, 66)',
      text: 'rgb(222, 222, 222)',
      add: 'rgb(161, 140, 35)',
      remove: 'rgb(57, 128, 113)',
    },
    markdown: {
      text: 'rgb(222, 222, 222)',
      background: 'rgb(40, 40, 40)',
      codeBackground: 'rgb(30, 30, 30)',
      quote: 'rgb(50, 50, 50)',
    },
    location: {
      text: 'rgb(222, 222, 222)',
      background: 'rgb(66, 66, 66)',
    },
  },
  borderWidth: 1,
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const monokaiTheme: CantoTheme = {
  name: 'monokai',
  isDark: true,
  colors: {
    background: 'rgb(39, 40, 34)',
    surface: 'rgb(60, 61, 54)',
    foreground: 'rgb(49, 50, 44)',
    text: 'rgb(248, 248, 242)',
    textSecondary: 'rgb(117, 113, 94)',
    primary: 'rgb(166, 226, 46)',
    accent: 'rgb(102, 217, 239)',
    border: 'rgb(117, 113, 94)',
    error: 'rgb(249, 38, 114)',
    success: 'rgb(166, 226, 46)',
    buttonSubmit: 'rgb(248, 248, 242)',
    buttonCancel: 'rgb(249, 38, 114)',
    buttonDisabled: 'rgb(60, 61, 54)',
    cardBackground: 'rgb(49, 50, 44)',
    highlight: 'rgb(60, 61, 54)',
    editBar: 'rgb(230, 219, 116)',
    deleteAction: 'rgb(249, 38, 114)',
    headerBackground: 'rgb(39, 40, 34)',
    filterRow: 'rgb(55, 56, 50)',
    newJournal: {
      text: 'rgb(248, 248, 242)',
      icon: 'rgb(230, 219, 116)',
      background: 'rgb(60, 61, 54)',
      border: 'rgb(230, 219, 116)',
    },
    popAction: {
      save: { background: 'rgb(166, 226, 46)', text: 'rgb(39, 40, 34)' },
      edit: { background: 'rgb(60, 61, 54)', text: 'rgb(248, 248, 242)' },
      new: { background: 'rgb(230, 219, 116)', text: 'rgb(39, 40, 34)' },
      delete: { background: 'rgb(249, 38, 114)', text: 'rgb(248, 248, 242)' },
    },
    tag: {
      default: 'rgb(60, 61, 54)',
      active: 'rgb(73, 74, 67)',
      text: 'rgb(248, 248, 242)',
      add: 'rgb(230, 219, 116)',
      remove: 'rgb(102, 217, 239)',
    },
    markdown: {
      text: 'rgb(248, 248, 242)',
      background: 'rgb(39, 40, 34)',
      codeBackground: 'rgb(49, 50, 44)',
      quote: 'rgb(60, 61, 54)',
    },
    location: {
      text: 'rgb(248, 248, 242)',
      background: 'rgb(60, 61, 54)',
    },
  },
  borderWidth: 1,
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const solarizedTheme: CantoTheme = {
  name: 'solarized',
  isDark: false,
  colors: {
    background: 'rgb(238, 232, 213)',
    surface: 'rgb(253, 246, 227)',
    foreground: 'rgb(253, 246, 227)',
    text: 'rgb(101, 123, 131)',
    textSecondary: 'rgb(88, 110, 117)',
    primary: 'rgb(38, 139, 210)',
    accent: 'rgb(42, 161, 152)',
    border: 'rgb(147, 161, 161)',
    error: 'rgb(220, 50, 47)',
    success: 'rgb(133, 153, 0)',
    buttonSubmit: 'rgb(7, 54, 66)',
    buttonCancel: 'rgb(220, 50, 47)',
    buttonDisabled: 'rgb(238, 232, 213)',
    cardBackground: 'rgb(253, 246, 227)',
    highlight: 'rgb(238, 232, 213)',
    editBar: 'rgb(181, 137, 0)',
    deleteAction: 'rgb(203, 75, 22)',
    headerBackground: 'rgb(253, 246, 227)',
    filterRow: 'rgb(218, 212, 193)',
    newJournal: {
      text: 'rgb(7, 54, 66)',
      icon: 'rgb(181, 137, 0)',
      background: 'rgb(238, 232, 213)',
      border: 'rgb(181, 137, 0)',
    },
    popAction: {
      save: { background: 'rgb(133, 153, 0)', text: 'rgb(253, 246, 227)' },
      edit: { background: 'rgb(253, 246, 227)', text: 'rgb(101, 123, 131)' },
      new: { background: 'rgb(181, 137, 0)', text: 'rgb(253, 246, 227)' },
      delete: { background: 'rgb(203, 75, 22)', text: 'rgb(253, 246, 227)' },
    },
    tag: {
      default: 'rgb(238, 232, 213)',
      active: 'rgb(218, 212, 193)',
      text: 'rgb(101, 123, 131)',
      add: 'rgb(181, 137, 0)',
      remove: 'rgb(42, 161, 152)',
    },
    markdown: {
      text: 'rgb(101, 123, 131)',
      background: 'rgb(253, 246, 227)',
      codeBackground: 'rgb(238, 232, 213)',
      quote: 'rgb(238, 232, 213)',
    },
    location: {
      text: 'rgb(101, 123, 131)',
      background: 'rgb(238, 232, 213)',
    },
  },
  borderWidth: 1,
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const nordTheme: CantoTheme = {
  name: 'nord',
  isDark: true,
  colors: {
    background: 'rgb(46, 52, 64)',
    surface: 'rgb(67, 76, 94)',
    foreground: 'rgb(59, 66, 82)',
    text: 'rgb(236, 239, 244)',
    textSecondary: 'rgb(216, 222, 233)',
    primary: 'rgb(136, 192, 208)',
    accent: 'rgb(129, 161, 193)',
    border: 'rgb(76, 86, 106)',
    error: 'rgb(191, 97, 106)',
    success: 'rgb(163, 190, 140)',
    buttonSubmit: 'rgb(236, 239, 244)',
    buttonCancel: 'rgb(191, 97, 106)',
    buttonDisabled: 'rgb(67, 76, 94)',
    cardBackground: 'rgb(59, 66, 82)',
    highlight: 'rgb(67, 76, 94)',
    editBar: 'rgb(235, 203, 139)',
    deleteAction: 'rgb(191, 97, 106)',
    headerBackground: 'rgb(46, 52, 64)',
    filterRow: 'rgb(59, 66, 82)',
    newJournal: {
      text: 'rgb(236, 239, 244)',
      icon: 'rgb(235, 203, 139)',
      background: 'rgb(67, 76, 94)',
      border: 'rgb(235, 203, 139)',
    },
    popAction: {
      save: { background: 'rgb(163, 190, 140)', text: 'rgb(46, 52, 64)' },
      edit: { background: 'rgb(67, 76, 94)', text: 'rgb(236, 239, 244)' },
      new: { background: 'rgb(235, 203, 139)', text: 'rgb(46, 52, 64)' },
      delete: { background: 'rgb(191, 97, 106)', text: 'rgb(236, 239, 244)' },
    },
    tag: {
      default: 'rgb(67, 76, 94)',
      active: 'rgb(76, 86, 106)',
      text: 'rgb(236, 239, 244)',
      add: 'rgb(235, 203, 139)',
      remove: 'rgb(136, 192, 208)',
    },
    markdown: {
      text: 'rgb(236, 239, 244)',
      background: 'rgb(46, 52, 64)',
      codeBackground: 'rgb(59, 66, 82)',
      quote: 'rgb(67, 76, 94)',
    },
    location: {
      text: 'rgb(236, 239, 244)',
      background: 'rgb(67, 76, 94)',
    },
  },
  borderWidth: 1,
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const draculaTheme: CantoTheme = {
  name: 'dracula',
  isDark: true,
  colors: {
    background: 'rgb(40, 42, 54)',
    surface: 'rgb(68, 71, 90)',
    foreground: 'rgb(50, 52, 66)',
    text: 'rgb(248, 248, 242)',
    textSecondary: 'rgb(98, 114, 164)',
    primary: 'rgb(189, 147, 249)',
    accent: 'rgb(139, 233, 253)',
    border: 'rgb(68, 71, 90)',
    error: 'rgb(255, 85, 85)',
    success: 'rgb(80, 250, 123)',
    buttonSubmit: 'rgb(248, 248, 242)',
    buttonCancel: 'rgb(255, 85, 85)',
    buttonDisabled: 'rgb(68, 71, 90)',
    cardBackground: 'rgb(50, 52, 66)',
    highlight: 'rgb(68, 71, 90)',
    editBar: 'rgb(241, 250, 140)',
    deleteAction: 'rgb(255, 85, 85)',
    headerBackground: 'rgb(40, 42, 54)',
    filterRow: 'rgb(55, 57, 70)',
    newJournal: {
      text: 'rgb(248, 248, 242)',
      icon: 'rgb(241, 250, 140)',
      background: 'rgb(68, 71, 90)',
      border: 'rgb(189, 147, 249)',
    },
    popAction: {
      save: { background: 'rgb(80, 250, 123)', text: 'rgb(40, 42, 54)' },
      edit: { background: 'rgb(68, 71, 90)', text: 'rgb(248, 248, 242)' },
      new: { background: 'rgb(241, 250, 140)', text: 'rgb(40, 42, 54)' },
      delete: { background: 'rgb(255, 85, 85)', text: 'rgb(248, 248, 242)' },
    },
    tag: {
      default: 'rgb(68, 71, 90)',
      active: 'rgb(78, 81, 100)',
      text: 'rgb(248, 248, 242)',
      add: 'rgb(241, 250, 140)',
      remove: 'rgb(139, 233, 253)',
    },
    markdown: {
      text: 'rgb(248, 248, 242)',
      background: 'rgb(40, 42, 54)',
      codeBackground: 'rgb(50, 52, 66)',
      quote: 'rgb(68, 71, 90)',
    },
    location: {
      text: 'rgb(248, 248, 242)',
      background: 'rgb(68, 71, 90)',
    },
  },
  borderWidth: 1,
  fonts: {
    regular: 'Lato-Regular',
    bold: 'Lato-Bold',
    light: 'Lato-Light',
    italic: 'Lato-Italic',
    serif: 'Merriweather-Regular',
    serifBold: 'Merriweather-Bold',
  },
};

export const themes: Record<ThemeName, CantoTheme> = {
  light: lightTheme,
  dark: darkTheme,
  monokai: monokaiTheme,
  solarized: solarizedTheme,
  nord: nordTheme,
  dracula: draculaTheme,
};

export const themeNames: ThemeName[] = ['light', 'dark', 'monokai', 'solarized', 'nord', 'dracula'];
