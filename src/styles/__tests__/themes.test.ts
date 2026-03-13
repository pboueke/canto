import { lightTheme, darkTheme, themes } from '../themes';

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
      'foreground',
      'text',
      'textSecondary',
      'primary',
      'accent',
      'border',
      'error',
      'success',
      'cardBackground',
      'highlight',
      'editBar',
      'deleteAction',
    ];
    for (const color of requiredColors) {
      expect(lightTheme.colors).toHaveProperty(color);
      expect(darkTheme.colors).toHaveProperty(color);
    }
  });

  it('both themes define borderWidth', () => {
    expect(lightTheme.borderWidth).toBe(2);
    expect(darkTheme.borderWidth).toBe(1);
  });

  it('light theme uses original color scheme', () => {
    expect(lightTheme.colors.background).toBe('rgb(190, 190, 190)');
    expect(lightTheme.colors.foreground).toBe('rgb(255, 255, 255)');
    expect(lightTheme.colors.primary).toBe('rgb(1, 85, 92)');
    expect(lightTheme.colors.text).toBe('rgb(0, 0, 0)');
  });

  it('dark theme uses original color scheme', () => {
    expect(darkTheme.colors.background).toBe('rgb(0, 0, 0)');
    expect(darkTheme.colors.foreground).toBe('rgb(40, 40, 40)');
    expect(darkTheme.colors.primary).toBe('rgb(255, 161, 186)');
    expect(darkTheme.colors.text).toBe('rgb(222, 222, 222)');
  });
});
