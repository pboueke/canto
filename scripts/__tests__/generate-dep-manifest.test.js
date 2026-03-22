const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(root, 'scripts', 'generate-dep-manifest.js');
const outPath = path.join(root, 'src', 'assets', 'dep-manifest.json');

describe('generate-dep-manifest', () => {
  it('generates a valid JSON manifest', () => {
    execSync(`node ${scriptPath}`, { cwd: root });
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);
  });

  it('every entry has non-empty name, version, and license', () => {
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const dep of manifest) {
      expect(dep.name).toBeTruthy();
      expect(dep.version).toBeTruthy();
      expect(dep.license).toBeTruthy();
    }
  });

  it('includes known production dependencies', () => {
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const names = manifest.map((d) => d.name);
    expect(names).toContain('react');
    expect(names).toContain('react-native');
    expect(names).toContain('expo');
  });

  it('does not include devDependencies', () => {
    const manifest = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const names = manifest.map((d) => d.name);
    expect(names).not.toContain('typescript');
    expect(names).not.toContain('prettier');
    expect(names).not.toContain('eslint');
  });

  it('exits with error code 1 when a dependency is missing', () => {
    // Create a temp package.json with a fake dependency
    const tmpDir = path.join(root, 'scripts', '__tests__', '.tmp');
    const tmpScripts = path.join(tmpDir, 'scripts');
    fs.mkdirSync(tmpScripts, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'nonexistent-pkg-xyz': '1.0.0' } }),
    );
    fs.mkdirSync(path.join(tmpDir, 'src', 'assets'), { recursive: true });
    // Copy script to tmp so __dirname resolves to tmpDir/scripts
    fs.copyFileSync(scriptPath, path.join(tmpScripts, 'generate-dep-manifest.js'));

    try {
      execSync(`node ${path.join(tmpScripts, 'generate-dep-manifest.js')}`, {
        cwd: tmpDir,
        stdio: 'pipe',
      });
      throw new Error('Expected script to fail');
    } catch (err) {
      expect(err.status).toBe(1);
      expect(err.stderr.toString()).toContain('nonexistent-pkg-xyz');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
