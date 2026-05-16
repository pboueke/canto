export type ThemeName =
  | 'light'
  | 'dark'
  | 'monokai'
  | 'solarized'
  | 'nord'
  | 'dracula'
  | 'everforest'
  | 'rosepine'
  | 'onecyan'
  | 'gruvbox';

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
    fontScale: number;
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
    fontScale: 1.0,
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
    fontScale: 1.0,
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
    fontScale: 1.0,
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
    fontScale: 1.0,
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
    fontScale: 1.0,
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
    fontScale: 1.0,
  },
};

// Everforest — inspired by sainnhe/everforest (dark green, soft contrast)
export const everforestTheme: CantoTheme = {
  name: 'everforest',
  isDark: true,
  colors: {
    background: 'rgb(39, 46, 34)',
    surface: 'rgb(52, 63, 46)',
    foreground: 'rgb(45, 55, 39)',
    text: 'rgb(211, 198, 170)',
    textSecondary: 'rgb(147, 144, 129)',
    primary: 'rgb(167, 192, 128)',
    accent: 'rgb(131, 192, 159)',
    border: 'rgb(73, 83, 65)',
    error: 'rgb(230, 126, 128)',
    success: 'rgb(167, 192, 128)',
    buttonSubmit: 'rgb(211, 198, 170)',
    buttonCancel: 'rgb(230, 126, 128)',
    buttonDisabled: 'rgb(52, 63, 46)',
    cardBackground: 'rgb(45, 55, 39)',
    highlight: 'rgb(52, 63, 46)',
    editBar: 'rgb(219, 188, 127)',
    deleteAction: 'rgb(230, 126, 128)',
    headerBackground: 'rgb(39, 46, 34)',
    filterRow: 'rgb(48, 58, 42)',
    newJournal: {
      text: 'rgb(211, 198, 170)',
      icon: 'rgb(219, 188, 127)',
      background: 'rgb(52, 63, 46)',
      border: 'rgb(167, 192, 128)',
    },
    popAction: {
      save: { background: 'rgb(167, 192, 128)', text: 'rgb(39, 46, 34)' },
      edit: { background: 'rgb(52, 63, 46)', text: 'rgb(211, 198, 170)' },
      new: { background: 'rgb(219, 188, 127)', text: 'rgb(39, 46, 34)' },
      delete: { background: 'rgb(230, 126, 128)', text: 'rgb(211, 198, 170)' },
    },
    tag: {
      default: 'rgb(52, 63, 46)',
      active: 'rgb(62, 73, 56)',
      text: 'rgb(211, 198, 170)',
      add: 'rgb(219, 188, 127)',
      remove: 'rgb(131, 192, 159)',
    },
    markdown: {
      text: 'rgb(211, 198, 170)',
      background: 'rgb(39, 46, 34)',
      codeBackground: 'rgb(45, 55, 39)',
      quote: 'rgb(52, 63, 46)',
    },
    location: {
      text: 'rgb(211, 198, 170)',
      background: 'rgb(52, 63, 46)',
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
    fontScale: 1.0,
  },
};

// Rosé Pine — inspired by rose-pine/rose-pine-theme (muted pink, elegant)
export const rosepineTheme: CantoTheme = {
  name: 'rosepine',
  isDark: true,
  colors: {
    background: 'rgb(25, 23, 36)',
    surface: 'rgb(38, 35, 53)',
    foreground: 'rgb(31, 29, 46)',
    text: 'rgb(224, 222, 244)',
    textSecondary: 'rgb(144, 140, 170)',
    primary: 'rgb(235, 188, 186)',
    accent: 'rgb(196, 167, 231)',
    border: 'rgb(57, 53, 82)',
    error: 'rgb(235, 111, 146)',
    success: 'rgb(156, 207, 216)',
    buttonSubmit: 'rgb(224, 222, 244)',
    buttonCancel: 'rgb(235, 111, 146)',
    buttonDisabled: 'rgb(38, 35, 53)',
    cardBackground: 'rgb(31, 29, 46)',
    highlight: 'rgb(38, 35, 53)',
    editBar: 'rgb(246, 193, 119)',
    deleteAction: 'rgb(235, 111, 146)',
    headerBackground: 'rgb(25, 23, 36)',
    filterRow: 'rgb(33, 31, 48)',
    newJournal: {
      text: 'rgb(224, 222, 244)',
      icon: 'rgb(246, 193, 119)',
      background: 'rgb(38, 35, 53)',
      border: 'rgb(235, 188, 186)',
    },
    popAction: {
      save: { background: 'rgb(156, 207, 216)', text: 'rgb(25, 23, 36)' },
      edit: { background: 'rgb(38, 35, 53)', text: 'rgb(224, 222, 244)' },
      new: { background: 'rgb(246, 193, 119)', text: 'rgb(25, 23, 36)' },
      delete: { background: 'rgb(235, 111, 146)', text: 'rgb(224, 222, 244)' },
    },
    tag: {
      default: 'rgb(38, 35, 53)',
      active: 'rgb(48, 45, 63)',
      text: 'rgb(224, 222, 244)',
      add: 'rgb(246, 193, 119)',
      remove: 'rgb(196, 167, 231)',
    },
    markdown: {
      text: 'rgb(224, 222, 244)',
      background: 'rgb(25, 23, 36)',
      codeBackground: 'rgb(31, 29, 46)',
      quote: 'rgb(38, 35, 53)',
    },
    location: {
      text: 'rgb(224, 222, 244)',
      background: 'rgb(38, 35, 53)',
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
    fontScale: 1.0,
  },
};

// One Cyan — inspired by Atom One Dark with cyan accent
export const onecyanTheme: CantoTheme = {
  name: 'onecyan',
  isDark: true,
  colors: {
    background: 'rgb(40, 44, 52)',
    surface: 'rgb(55, 59, 69)',
    foreground: 'rgb(49, 53, 63)',
    text: 'rgb(171, 178, 191)',
    textSecondary: 'rgb(92, 99, 112)',
    primary: 'rgb(86, 182, 194)',
    accent: 'rgb(97, 175, 239)',
    border: 'rgb(67, 72, 83)',
    error: 'rgb(224, 108, 117)',
    success: 'rgb(152, 195, 121)',
    buttonSubmit: 'rgb(171, 178, 191)',
    buttonCancel: 'rgb(224, 108, 117)',
    buttonDisabled: 'rgb(55, 59, 69)',
    cardBackground: 'rgb(49, 53, 63)',
    highlight: 'rgb(55, 59, 69)',
    editBar: 'rgb(229, 192, 123)',
    deleteAction: 'rgb(224, 108, 117)',
    headerBackground: 'rgb(40, 44, 52)',
    filterRow: 'rgb(50, 54, 64)',
    newJournal: {
      text: 'rgb(171, 178, 191)',
      icon: 'rgb(229, 192, 123)',
      background: 'rgb(55, 59, 69)',
      border: 'rgb(86, 182, 194)',
    },
    popAction: {
      save: { background: 'rgb(152, 195, 121)', text: 'rgb(40, 44, 52)' },
      edit: { background: 'rgb(55, 59, 69)', text: 'rgb(171, 178, 191)' },
      new: { background: 'rgb(229, 192, 123)', text: 'rgb(40, 44, 52)' },
      delete: { background: 'rgb(224, 108, 117)', text: 'rgb(171, 178, 191)' },
    },
    tag: {
      default: 'rgb(55, 59, 69)',
      active: 'rgb(65, 69, 79)',
      text: 'rgb(171, 178, 191)',
      add: 'rgb(229, 192, 123)',
      remove: 'rgb(86, 182, 194)',
    },
    markdown: {
      text: 'rgb(171, 178, 191)',
      background: 'rgb(40, 44, 52)',
      codeBackground: 'rgb(49, 53, 63)',
      quote: 'rgb(55, 59, 69)',
    },
    location: {
      text: 'rgb(171, 178, 191)',
      background: 'rgb(55, 59, 69)',
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
    fontScale: 1.0,
  },
};

// Gruvbox — inspired by morhetz/gruvbox (warm dark red / wine tones)
export const gruvboxTheme: CantoTheme = {
  name: 'gruvbox',
  isDark: true,
  colors: {
    background: 'rgb(40, 40, 40)',
    surface: 'rgb(60, 56, 54)',
    foreground: 'rgb(50, 48, 47)',
    text: 'rgb(235, 219, 178)',
    textSecondary: 'rgb(168, 153, 132)',
    primary: 'rgb(204, 36, 29)',
    accent: 'rgb(215, 153, 33)',
    border: 'rgb(80, 73, 69)',
    error: 'rgb(251, 73, 52)',
    success: 'rgb(184, 187, 38)',
    buttonSubmit: 'rgb(235, 219, 178)',
    buttonCancel: 'rgb(251, 73, 52)',
    buttonDisabled: 'rgb(60, 56, 54)',
    cardBackground: 'rgb(50, 48, 47)',
    highlight: 'rgb(60, 56, 54)',
    editBar: 'rgb(250, 189, 47)',
    deleteAction: 'rgb(251, 73, 52)',
    headerBackground: 'rgb(40, 40, 40)',
    filterRow: 'rgb(50, 48, 47)',
    newJournal: {
      text: 'rgb(235, 219, 178)',
      icon: 'rgb(250, 189, 47)',
      background: 'rgb(60, 56, 54)',
      border: 'rgb(204, 36, 29)',
    },
    popAction: {
      save: { background: 'rgb(184, 187, 38)', text: 'rgb(40, 40, 40)' },
      edit: { background: 'rgb(60, 56, 54)', text: 'rgb(235, 219, 178)' },
      new: { background: 'rgb(250, 189, 47)', text: 'rgb(40, 40, 40)' },
      delete: { background: 'rgb(251, 73, 52)', text: 'rgb(235, 219, 178)' },
    },
    tag: {
      default: 'rgb(60, 56, 54)',
      active: 'rgb(70, 66, 64)',
      text: 'rgb(235, 219, 178)',
      add: 'rgb(250, 189, 47)',
      remove: 'rgb(215, 153, 33)',
    },
    markdown: {
      text: 'rgb(235, 219, 178)',
      background: 'rgb(40, 40, 40)',
      codeBackground: 'rgb(50, 48, 47)',
      quote: 'rgb(60, 56, 54)',
    },
    location: {
      text: 'rgb(235, 219, 178)',
      background: 'rgb(60, 56, 54)',
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
    fontScale: 1.0,
  },
};

export const themes: Record<ThemeName, CantoTheme> = {
  light: lightTheme,
  dark: darkTheme,
  monokai: monokaiTheme,
  solarized: solarizedTheme,
  nord: nordTheme,
  dracula: draculaTheme,
  everforest: everforestTheme,
  rosepine: rosepineTheme,
  onecyan: onecyanTheme,
  gruvbox: gruvboxTheme,
};

export const themeNames: ThemeName[] = [
  'light',
  'dark',
  'monokai',
  'solarized',
  'nord',
  'dracula',
  'everforest',
  'rosepine',
  'onecyan',
  'gruvbox',
];

/**
 * Parse an rgb(...) color string into [r, g, b] components.
 */
function parseRgb(color: string): [number, number, number] {
  const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Compute relative luminance per WCAG 2.x (sRGB).
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Return a text color (#fff or #000) that provides better contrast
 * against the given background color (rgb(...) string).
 */
export function getContrastText(bgColor: string): '#fff' | '#000' {
  const [r, g, b] = parseRgb(bgColor);
  const lum = relativeLuminance(r, g, b);
  // Contrast ratio against white: (1.05) / (lum + 0.05)
  // Contrast ratio against black: (lum + 0.05) / 0.05
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#fff' : '#000';
}
