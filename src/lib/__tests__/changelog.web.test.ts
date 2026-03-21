jest.mock('expo-asset', () => ({
  Asset: { loadAsync: jest.fn() },
}));

jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

// Mock global fetch
const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('changelog.web', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
  });

  describe('loadChangelog', () => {
    it('loads changelog via expo-asset and fetch', async () => {
      jest.mock('expo-asset', () => ({
        Asset: {
          loadAsync: jest.fn().mockResolvedValue([{ localUri: 'http://localhost/CHANGELOG.md' }]),
        },
      }));
      jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('# Changelog\n\n## v2.0.0\n\nRelease notes'),
      });

      const { loadChangelog } = require('../changelog.web');
      const text = await loadChangelog();

      expect(text).toBe('# Changelog\n\n## v2.0.0\n\nRelease notes');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost/CHANGELOG.md');
    });

    it('returns cached changelog on second call', async () => {
      jest.mock('expo-asset', () => ({
        Asset: {
          loadAsync: jest.fn().mockResolvedValue([{ localUri: 'http://localhost/CHANGELOG.md' }]),
        },
      }));
      jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

      mockFetch.mockResolvedValue({
        text: () => Promise.resolve('cached content'),
      });

      const { loadChangelog } = require('../changelog.web');
      const text1 = await loadChangelog();
      const text2 = await loadChangelog();

      expect(text1).toBe(text2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws when asset has no localUri', async () => {
      jest.mock('expo-asset', () => ({
        Asset: {
          loadAsync: jest.fn().mockResolvedValue([{ localUri: null }]),
        },
      }));
      jest.mock('../../../CHANGELOG.md', () => 'mock-changelog-module', { virtual: true });

      const { loadChangelog } = require('../changelog.web');
      await expect(loadChangelog()).rejects.toThrow('Failed to load changelog asset');
    });
  });

  describe('parseVersionFromChangelog', () => {
    it('extracts version from standard changelog heading', () => {
      const { parseVersionFromChangelog } = require('../changelog.web');
      expect(parseVersionFromChangelog('## v1.2.3 — Title')).toBe('1.2.3');
    });

    it('returns 0.0.0 when no version found', () => {
      const { parseVersionFromChangelog } = require('../changelog.web');
      expect(parseVersionFromChangelog('no version')).toBe('0.0.0');
    });
  });
});
