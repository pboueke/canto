jest.mock('expo-asset', () => ({
  Asset: { loadAsync: jest.fn() },
}));

jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

import { parseVersionFromChangelog } from '../changelog';

describe('parseVersionFromChangelog', () => {
  it('extracts version from standard changelog heading', () => {
    const text = '# Changelog\n\n## v1.2.3 — Some Title\n\nSome content';
    expect(parseVersionFromChangelog(text)).toBe('1.2.3');
  });

  it('extracts first version when multiple exist', () => {
    const text = '## v2.0.0\n\n## v1.0.0\n';
    expect(parseVersionFromChangelog(text)).toBe('2.0.0');
  });

  it('returns 0.0.0 when no version found', () => {
    expect(parseVersionFromChangelog('no version here')).toBe('0.0.0');
    expect(parseVersionFromChangelog('')).toBe('0.0.0');
  });

  it('handles version with extra text after', () => {
    const text = '## v10.20.30 - Major Release\n';
    expect(parseVersionFromChangelog(text)).toBe('10.20.30');
  });
});
