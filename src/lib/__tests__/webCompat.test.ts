/**
 * Regression test: every source file that imports native-only modules
 * (expo-file-system, expo-secure-store) MUST have a .web.ts counterpart
 * so the app doesn't crash on web.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../../..');
const NATIVE_ONLY_MODULES = ['expo-file-system', 'expo-secure-store'];

function findTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__')
        continue;
      results.push(...findTsFiles(full));
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.web.ts') &&
      !entry.name.endsWith('.web.tsx') &&
      !entry.name.endsWith('.native.ts') &&
      !entry.name.endsWith('.native.tsx') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      results.push(full);
    }
  }
  return results;
}

describe('web compatibility', () => {
  it('every file importing native-only modules has a .web.ts counterpart or uses lazy require', () => {
    const files = [
      ...findTsFiles(path.join(SRC_DIR, 'src')),
      ...findTsFiles(path.join(SRC_DIR, 'app')),
    ];
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');

      // Check for top-level (static) imports of native-only modules
      const hasStaticNativeImport = NATIVE_ONLY_MODULES.some(
        (mod) =>
          content.includes(`from '${mod}'`) ||
          content.includes(`from "${mod}"`) ||
          content.includes(`from '${mod}/`) ||
          content.includes(`from "${mod}/`),
      );

      if (!hasStaticNativeImport) continue;

      // Check for a .web.ts(x) counterpart
      const ext = path.extname(file);
      const base = file.slice(0, -ext.length);
      const webFile = `${base}.web${ext}`;
      if (!fs.existsSync(webFile)) {
        const relative = path.relative(SRC_DIR, file);
        violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });
});
