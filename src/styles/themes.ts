export interface CantoTheme {
  name: 'light' | 'dark';
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

export const themes = { light: lightTheme, dark: darkTheme } as const;
