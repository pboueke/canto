import { loadDependencies, type DependencyInfo } from '@/lib/dependencies';

describe('loadDependencies', () => {
  it('returns an array of dependency objects', () => {
    const deps = loadDependencies();
    expect(Array.isArray(deps)).toBe(true);
    expect(deps.length).toBeGreaterThan(0);
  });

  it('each entry has name, version, and license fields', () => {
    const deps = loadDependencies();
    for (const dep of deps) {
      expect(typeof dep.name).toBe('string');
      expect(typeof dep.version).toBe('string');
      expect(typeof dep.license).toBe('string');
      expect(dep.name.length).toBeGreaterThan(0);
    }
  });

  it('includes known production dependencies', () => {
    const deps = loadDependencies();
    const names = deps.map((d: DependencyInfo) => d.name);
    expect(names).toContain('react');
    expect(names).toContain('react-native');
    expect(names).toContain('expo');
  });
});
