import {
  SCHEMA_VERSION,
  compareVersions,
  needsMigration,
  isFutureVersion,
  isMajorUpgrade,
} from '../version';

describe('SCHEMA_VERSION', () => {
  test('is a valid semver string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('compareVersions', () => {
  test('equal versions return 0', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  test('major difference', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
  });

  test('minor difference', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
  });

  test('patch difference', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1);
  });

  test('throws on invalid version', () => {
    expect(() => compareVersions('1.0', '1.0.0')).toThrow(/Invalid schema version/);
    expect(() => compareVersions('abc', '1.0.0')).toThrow(/Invalid schema version/);
  });
});

describe('needsMigration', () => {
  test('returns false for current version', () => {
    expect(needsMigration(SCHEMA_VERSION)).toBe(false);
  });

  test('returns true for older version', () => {
    expect(needsMigration('0.9.0')).toBe(true);
  });

  test('returns false for future version', () => {
    expect(needsMigration('99.0.0')).toBe(false);
  });
});

describe('isFutureVersion', () => {
  test('returns false for current version', () => {
    expect(isFutureVersion(SCHEMA_VERSION)).toBe(false);
  });

  test('returns false for older version', () => {
    expect(isFutureVersion('0.9.0')).toBe(false);
  });

  test('returns true for newer version', () => {
    expect(isFutureVersion('99.0.0')).toBe(true);
  });
});

describe('isMajorUpgrade', () => {
  test('returns true for different major versions', () => {
    expect(isMajorUpgrade('1.0.0', '2.0.0')).toBe(true);
  });

  test('returns false for same major version', () => {
    expect(isMajorUpgrade('1.0.0', '1.1.0')).toBe(false);
    expect(isMajorUpgrade('1.0.0', '1.0.1')).toBe(false);
  });
});
