export interface DependencyInfo {
  name: string;
  version: string;
  license: string;
}

export function loadDependencies(): DependencyInfo[] {
  return require('@/assets/dep-manifest.json');
}
