import { lightTheme, darkTheme, themes } from '../src/styles/themes';

describe('Themes', () => {
  it('light theme has name "light"', () => {
    expect(lightTheme.name).toBe('light');
  });

  it('dark theme has name "dark"', () => {
    expect(darkTheme.name).toBe('dark');
  });

  it('themes object contains both themes', () => {
    expect(themes.light).toBe(lightTheme);
    expect(themes.dark).toBe(darkTheme);
  });

  it('light and dark themes have different background colors', () => {
    expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
  });

  it('both themes define all required color properties', () => {
    const requiredColors = [
      'background',
      'surface',
      'text',
      'textSecondary',
      'primary',
      'accent',
      'border',
      'error',
      'success',
    ];
    for (const color of requiredColors) {
      expect(lightTheme.colors).toHaveProperty(color);
      expect(darkTheme.colors).toHaveProperty(color);
    }
  });
});
