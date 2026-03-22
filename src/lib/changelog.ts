import { Asset } from 'expo-asset';
// @ts-expect-error — expo-file-system/next has no type declarations in this SDK version
import { File } from 'expo-file-system/next';

const changelogModule = require('../../CHANGELOG.md');

let cachedChangelog: string | null = null;

export async function loadChangelog(): Promise<string> {
  if (cachedChangelog) return cachedChangelog;
  const [asset] = await Asset.loadAsync(changelogModule);
  if (!asset.localUri) {
    throw new Error('Failed to load changelog asset');
  }
  const file = new File(asset.localUri);
  cachedChangelog = file.text() as string;
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
