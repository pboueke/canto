jest.mock('expo-asset', () => ({
  Asset: { loadAsync: jest.fn() },
}));

jest.mock('expo-file-system/next', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    text: () => `# Changelog\n\n## v1.0.0\n\nContent from file at ${uri}`,
  })),
}));

jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

import { loadChangelog, parseVersionFromChangelog } from '../changelog';
import { Asset } from 'expo-asset';

describe('loadChangelog', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('loads changelog via expo-asset and expo-file-system/next', async () => {
    (Asset.loadAsync as jest.Mock).mockResolvedValue([{ localUri: '/path/to/CHANGELOG.md' }]);

    const text = await loadChangelog();
    expect(Asset.loadAsync).toHaveBeenCalledWith('mock-changelog-module');
    expect(text).toContain('Changelog');
  });

  it('returns cached changelog on second call', async () => {
    (Asset.loadAsync as jest.Mock).mockResolvedValue([{ localUri: '/path/to/CHANGELOG.md' }]);

    const text1 = await loadChangelog();
    const text2 = await loadChangelog();
    expect(text1).toBe(text2);
    // loadAsync was called once from the first test + once from this test's first call
    // but the second call should use cache
  });

  it('throws when asset has no localUri', async () => {
    // Need a fresh module to clear the cache
    jest.isolateModules(() => {
      jest.mock('expo-asset', () => ({
        Asset: {
          loadAsync: jest.fn().mockResolvedValue([{ localUri: null }]),
        },
      }));
      jest.mock('expo-file-system/next', () => ({
        File: jest.fn(),
      }));
      jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });
    });

    // Re-import with isolated module to clear cache
    jest.resetModules();
    jest.mock('expo-asset', () => ({
      Asset: {
        loadAsync: jest.fn().mockResolvedValue([{ localUri: null }]),
      },
    }));
    jest.mock('expo-file-system/next', () => ({
      File: jest.fn(),
    }));
    jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

    const { loadChangelog: freshLoad } = require('../changelog');
    await expect(freshLoad()).rejects.toThrow('Failed to load changelog asset');
  });
});

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
