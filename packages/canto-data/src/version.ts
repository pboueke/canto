/** Current Canto journal schema version (semver). */
export const SCHEMA_VERSION = '0.17.0';

/** Parse a semver string into [major, minor, patch]. Throws on invalid format. */
function parseSemver(v: string): [number, number, number] {
  const parts = v.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid schema version: "${v}" (expected semver like "1.0.0")`);
  }
  return parts as [number, number, number];
}

/** Compare two semver strings. Returns -1 (a < b), 0 (equal), or 1 (a > b). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);

  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1;
  if (aMin !== bMin) return aMin < bMin ? -1 : 1;
  if (aPat !== bPat) return aPat < bPat ? -1 : 1;
  return 0;
}

/** True if `version` needs migration to reach SCHEMA_VERSION (strictly older). */
export function needsMigration(version: string): boolean {
  return compareVersions(version, SCHEMA_VERSION) < 0;
}

/** True if `version` is newer than SCHEMA_VERSION (can't handle). */
export function isFutureVersion(version: string): boolean {
  return compareVersions(version, SCHEMA_VERSION) > 0;
}

/** True if `version` requires a breaking migration (different major version). */
export function isMajorUpgrade(from: string, to: string): boolean {
  const [fromMaj] = parseSemver(from);
  const [toMaj] = parseSemver(to);
  return toMaj > fromMaj;
}
