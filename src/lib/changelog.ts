import { Asset } from 'expo-asset';

export const APP_VERSION = '0.3.0';

const changelogModule = require('../../CHANGELOG.md');

export async function loadChangelog(): Promise<string> {
  const [asset] = await Asset.loadAsync(changelogModule);
  if (!asset.localUri) {
    throw new Error('Failed to load changelog asset');
  }
  const response = await fetch(asset.localUri);
  return response.text();
}
