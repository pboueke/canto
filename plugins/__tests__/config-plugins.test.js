const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyDebugApplicationIdSuffix } = require('../withAndroidDebugApplicationId');
const { applyReleaseSigningConfig } = require('../withReleaseSigningConfig');
const {
  applyOptimizingProguardConfig,
  upsertOptimizedResourceShrinking,
} = require('../withAndroidReleaseOptimization');
const { registerCantoArchivePackage, syncCantoArchiveSources } = require('../withCantoArchive');

const BUILD_GRADLE_FIXTURE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}`;

const MAIN_APPLICATION_FIXTURE = `package com.boueke.canto

class MainApplication {
  val packages = PackageList(this).packages.apply {
  }
}`;

describe('Android config plugin transformations', () => {
  it('represents release minification and resource shrinking once in Expo config', () => {
    const config = require('../../app.config');
    const buildPropertyPlugins = config.plugins.filter(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildPropertyPlugins).toHaveLength(1);
    expect(buildPropertyPlugins[0][1]).toMatchObject({
      android: {
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
      },
    });
  });

  it('registers the debug application ID plugin exactly once in Expo config', () => {
    const config = require('../../app.config');
    expect(
      config.plugins.filter((plugin) => plugin === './plugins/withAndroidDebugApplicationId'),
    ).toHaveLength(1);
  });

  it('adds a debug-only application ID suffix exactly once', () => {
    const once = applyDebugApplicationIdSuffix(BUILD_GRADLE_FIXTURE);
    const twice = applyDebugApplicationIdSuffix(once);

    expect(twice).toBe(once);
    expect(once.match(/applicationIdSuffix ['"]\.debug['"]/g)).toHaveLength(1);
    expect(once).toContain(`debug {
            applicationIdSuffix '.debug'
            signingConfig signingConfigs.debug`);
  });

  it('rejects a debug application ID suffix outside the debug buildType', () => {
    const misplaced = BUILD_GRADLE_FIXTURE.replace(
      '        release {',
      `        release {
            applicationIdSuffix '.debug'`,
    );

    expect(() => applyDebugApplicationIdSuffix(misplaced)).toThrow(/outside the debug buildType/);
  });

  it('inserts release signing exactly once and points release builds to it', () => {
    const once = applyReleaseSigningConfig(BUILD_GRADLE_FIXTURE);
    const twice = applyReleaseSigningConfig(once);

    expect(twice).toBe(once);
    expect(once.match(/storeFile file\('upload-keystore\.jks'\)/g)).toHaveLength(1);
    expect(once).toContain('signingConfig signingConfigs.release');
  });

  it('fails clearly when the signing template anchor changes', () => {
    expect(() => applyReleaseSigningConfig('android { buildTypes {} }')).toThrow(
      /signingConfigs block/,
    );
  });

  it('rejects a signing sequence moved into the debug buildType', () => {
    const signingSequence = `signingConfig signingConfigs.debug
            def enableShrinkResources`;
    const misplaced = BUILD_GRADLE_FIXTURE.replace(
      signingSequence,
      'def releaseSigningIsMissing = true',
    ).replace(
      '    buildTypes {',
      `    buildTypes {
        debug {
            ${signingSequence}
        }`,
    );

    expect(() => applyReleaseSigningConfig(misplaced)).toThrow(/release buildType/);
  });

  it('rejects a partial release signing block', () => {
    const partial = BUILD_GRADLE_FIXTURE.replace(
      "storeFile file('debug.keystore')",
      "storeFile file('upload-keystore.jks')",
    );
    expect(() => applyReleaseSigningConfig(partial)).toThrow(/partial or unsupported/);
  });

  it('uses the optimizing ProGuard baseline exactly once', () => {
    const once = applyOptimizingProguardConfig(BUILD_GRADLE_FIXTURE);
    const twice = applyOptimizingProguardConfig(once);

    expect(twice).toBe(once);
    expect(once).toContain('proguard-android-optimize.txt');
    expect(once).not.toContain('proguard-android.txt');
  });

  it('fails clearly when the ProGuard template anchor changes', () => {
    expect(() => applyOptimizingProguardConfig('android {}')).toThrow(/release buildType/);
  });

  it('rejects a complete ProGuard sequence moved into the debug buildType', () => {
    const proguardSequence = `minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"`;
    const misplaced = BUILD_GRADLE_FIXTURE.replace(proguardSequence, 'minifyEnabled false').replace(
      '    buildTypes {',
      `    buildTypes {
        debug {
            ${proguardSequence}
        }`,
    );

    expect(() => applyOptimizingProguardConfig(misplaced)).toThrow(/release buildType/);
  });

  it('rejects mixed legacy and optimizing ProGuard declarations', () => {
    const mixed = `${BUILD_GRADLE_FIXTURE}\n${'getDefaultProguardFile("proguard-android-optimize.txt")'}`;
    expect(() => applyOptimizingProguardConfig(mixed)).toThrow(
      /found 1 legacy and 1 optimizing declarations/,
    );
  });

  it('upserts optimized resource shrinking idempotently', () => {
    const existing = [
      { type: 'comment', value: 'settings' },
      { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'false' },
      { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'false' },
    ];
    const once = upsertOptimizedResourceShrinking(existing);
    const twice = upsertOptimizedResourceShrinking(once);
    const properties = twice.filter(
      (entry) => entry.type === 'property' && entry.key === 'android.r8.optimizedResourceShrinking',
    );

    expect(twice).toEqual(once);
    expect(properties).toEqual([
      { type: 'property', key: 'android.r8.optimizedResourceShrinking', value: 'true' },
    ]);
  });

  it('registers CantoArchivePackage exactly once', () => {
    const once = registerCantoArchivePackage(MAIN_APPLICATION_FIXTURE);
    const twice = registerCantoArchivePackage(once);

    expect(twice).toBe(once);
    expect(once.match(/add\(CantoArchivePackage\(\)\)/g)).toHaveLength(1);
  });

  it('fails clearly when the MainApplication anchor changes', () => {
    expect(() => registerCantoArchivePackage('class MainApplication')).toThrow(
      /expected Expo PackageList application anchor/,
    );
  });

  it('rejects an archive registration outside the PackageList block', () => {
    expect(() =>
      registerCantoArchivePackage(
        `${MAIN_APPLICATION_FIXTURE}\nfun unsupported() = add(CantoArchivePackage())`,
      ),
    ).toThrow(/outside the expected PackageList block/);
  });

  it('copies canonical archive sources into the generated package', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canto-plugin-project-'));
    const platformProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canto-plugin-android-'));
    const canonicalDirectory = path.join(projectRoot, 'native', 'canto-archive');
    const packageDirectory = path.join(
      platformProjectRoot,
      'app',
      'src',
      'main',
      'java',
      'com',
      'boueke',
      'canto',
    );

    fs.mkdirSync(canonicalDirectory, { recursive: true });
    fs.mkdirSync(packageDirectory, { recursive: true });
    fs.writeFileSync(path.join(canonicalDirectory, 'CantoArchiveModule.kt'), 'module source');
    fs.writeFileSync(path.join(canonicalDirectory, 'CantoArchivePackage.kt'), 'package source');
    fs.writeFileSync(path.join(packageDirectory, 'MainApplication.kt'), MAIN_APPLICATION_FIXTURE);

    syncCantoArchiveSources({
      projectRoot,
      platformProjectRoot,
      packageName: 'com.boueke.canto',
    });
    syncCantoArchiveSources({
      projectRoot,
      platformProjectRoot,
      packageName: 'com.boueke.canto',
    });

    expect(fs.readFileSync(path.join(packageDirectory, 'CantoArchiveModule.kt'), 'utf8')).toBe(
      'module source',
    );
    expect(fs.readFileSync(path.join(packageDirectory, 'CantoArchivePackage.kt'), 'utf8')).toBe(
      'package source',
    );
    expect(
      fs
        .readFileSync(path.join(packageDirectory, 'MainApplication.kt'), 'utf8')
        .match(/CantoArchivePackage/g),
    ).toHaveLength(1);
  });
});
