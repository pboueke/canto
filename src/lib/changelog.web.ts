import { Asset } from 'expo-asset';

const changelogModule = require('../../CHANGELOG.md');

let cachedChangelog: string | null = null;

export async function loadChangelog(): Promise<string> {
  if (cachedChangelog) return cachedChangelog;
  const [asset] = await Asset.loadAsync(changelogModule);
  if (!asset.localUri) {
    throw new Error('Failed to load changelog asset');
  }
  // On web, expo-asset provides a URL we can fetch
  const response = await fetch(asset.localUri);
  cachedChangelog = await response.text();
  return cachedChangelog;
}

/**
 * Extract the latest version from the changelog.
 * Looks for the first line matching `## vX.Y.Z`.
 */
export function parseVersionFromChangelog(text: string): string {
  const match = text.match(/^## v(\d+\.\d+\.\d+)/m);
  return match ? match[1] : '0.0.0';
}
