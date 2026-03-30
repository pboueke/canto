#!/usr/bin/env node

// Generates src/assets/dep-manifest.json from production dependencies.
// Re-run after changing dependencies: npm run generate:deps

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = Object.keys(pkg.dependencies || {}).sort();

const errors = [];
const manifest = deps.map((name) => {
  const depPkgPath = path.join(root, 'node_modules', name, 'package.json');
  let depPkg;
  try {
    depPkg = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
  } catch (err) {
    errors.push(`${name}: failed to read ${depPkgPath} — ${err.message}`);
    return null;
  }
  if (!depPkg.version) {
    errors.push(`${name}: missing "version" field in ${depPkgPath}`);
  }
  if (!depPkg.license) {
    errors.push(`${name}: missing "license" field in ${depPkgPath}`);
  }
  return {
    name,
    version: depPkg.version,
    license: depPkg.license,
  };
});

if (errors.length > 0) {
  console.error('Dependency manifest generation failed:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const outPath = path.join(root, 'src', 'assets', 'dep-manifest.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifest.length} dependencies to ${path.relative(root, outPath)}`);
