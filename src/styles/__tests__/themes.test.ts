import { lightTheme, darkTheme, themes, getContrastText } from '../themes';

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

describe('getContrastText', () => {
  it('returns white for dark backgrounds', () => {
    expect(getContrastText('rgb(0, 0, 0)')).toBe('#fff');
    expect(getContrastText('rgb(40, 40, 40)')).toBe('#fff');
    expect(getContrastText('rgb(50, 48, 47)')).toBe('#fff');
  });

  it('returns black for light backgrounds', () => {
    expect(getContrastText('rgb(255, 255, 255)')).toBe('#000');
    expect(getContrastText('rgb(230, 230, 230)')).toBe('#000');
  });

  it('returns WCAG AA-compliant text color for all theme error colors', () => {
    // Helper: compute relative luminance
    function luminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function contrastRatio(l1: number, l2: number): number {
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    function parseRgb(color: string): [number, number, number] {
      const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (!m) return [0, 0, 0];
      return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    }

    for (const [name, theme] of Object.entries(themes)) {
      const errorColor = theme.colors.error;
      const textColor = getContrastText(errorColor);
      const [er, eg, eb] = parseRgb(errorColor);
      const bgLum = luminance(er, eg, eb);
      const textLum = textColor === '#fff' ? 1.0 : 0.0;
      const ratio = contrastRatio(bgLum, textLum);

      // WCAG AA large text minimum is 3:1
      if (ratio < 3.0) {
        throw new Error(
          `${name}: error=${errorColor} text=${textColor} ratio=${ratio.toFixed(2)} (need >= 3.0)`,
        );
      }
    }
  });
});
