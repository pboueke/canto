const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applyDebugApplicationIdSuffix } = require('../withAndroidDebugApplicationId');
const { applyReleaseSigningConfig } = require('../withReleaseSigningConfig');
const {
  applyOptimizingProguardConfig,
  upsertOptimizedResourceShrinking,
  upsertExpoRecordConverterKeepRule,
  EXPO_RECORD_CONVERTER_KEEP_RULE,
} = require('../withAndroidReleaseOptimization');
const { registerCantoArchivePackage, syncCantoArchiveSources } = require('../withCantoArchive');
const { applyRecentsPrivacy } = require('../withAndroidRecentsPrivacy');

const MAIN_ACTIVITY_FIXTURE = `package com.boueke.canto
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}`;

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
  it('enables R8 while keeping resource shrinking separate for the candidate build', () => {
    const config = require('../../app.config');
    const buildPropertyPlugins = config.plugins.filter(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
    );

    expect(buildPropertyPlugins).toHaveLength(1);
    expect(buildPropertyPlugins[0][1]).toMatchObject({
      android: {
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: false,
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

  it('keeps only the Expo Record converter and its nested classes exactly once', () => {
    const original = '# project-specific rules\n';
    const once = upsertExpoRecordConverterKeepRule(original);

    expect(upsertExpoRecordConverterKeepRule(once)).toBe(once);
    expect(
      once.match(/-keep class expo\.modules\.kotlin\.records\.RecordTypeConverter\*/g),
    ).toHaveLength(1);
    expect(once).toContain(EXPO_RECORD_CONVERTER_KEEP_RULE);
    expect(upsertExpoRecordConverterKeepRule(`# ${EXPO_RECORD_CONVERTER_KEEP_RULE}\n`)).toContain(
      `\n${EXPO_RECORD_CONVERTER_KEEP_RULE}\n`,
    );
    expect(() =>
      upsertExpoRecordConverterKeepRule(`${once}${EXPO_RECORD_CONVERTER_KEEP_RULE}\n`),
    ).toThrow(/duplicate Expo Record converter/);
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

describe('Android recents privacy plugin', () => {
  it('is registered exactly once in Expo config', () => {
    const config = require('../../app.config');
    expect(
      config.plugins.filter((plugin) => plugin === './plugins/withAndroidRecentsPrivacy'),
    ).toHaveLength(1);
  });

  it('blocks the media permission Canto never uses', () => {
    const config = require('../../app.config');
    expect(config.android.blockedPermissions).toContain('android.permission.READ_MEDIA_IMAGES');
  });

  it('keeps DETECT_SCREEN_CAPTURE, which expo-screen-capture needs at startup', () => {
    // On API 34+ the module registers a screen-capture callback when it is
    // created; without this install-time permission Android throws and the
    // app aborts on launch (0.21.0 internal build, versionCode 31).
    const config = require('../../app.config');
    expect(config.android.blockedPermissions ?? []).not.toContain(
      'android.permission.DETECT_SCREEN_CAPTURE',
    );
  });

  it('withholds the recents thumbnail on API 33+ after onCreate, idempotently', () => {
    const once = applyRecentsPrivacy(MAIN_ACTIVITY_FIXTURE);
    expect(applyRecentsPrivacy(once)).toBe(once);
    expect(once).toContain(`super.onCreate(null)
    // @generated begin canto-recents-privacy
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      setRecentsScreenshotEnabled(false)
    }`);
    expect(once.match(/setRecentsScreenshotEnabled/g)).toHaveLength(1);
  });

  it('adds the Build import when the template lacks it', () => {
    const withoutImport = MAIN_ACTIVITY_FIXTURE.replace('import android.os.Build\n', '');
    const patched = applyRecentsPrivacy(withoutImport);
    const header = patched.split('class MainActivity')[0];
    expect(header).toContain('import android.os.Build\n');
    expect(header).toContain('import android.view.WindowManager\n');
    expect(patched.startsWith('package com.boueke.canto\n')).toBe(true);
  });

  it('fails loudly instead of guessing when the template changes', () => {
    expect(() => applyRecentsPrivacy('class MainActivity {}')).toThrow(
      'expected one MainActivity super.onCreate(null) call, found 0',
    );
    const duplicated = `${applyRecentsPrivacy(MAIN_ACTIVITY_FIXTURE)}\n// @generated begin canto-recents-privacy`;
    expect(() => applyRecentsPrivacy(duplicated)).toThrow('found 2');
    expect(() => applyRecentsPrivacy('class MainActivity {\n  super.onCreate(null)\n}')).toThrow(
      'MainActivity has no package line',
    );
  });

  // Cross-platform review: on Android 12 and below the in-app cover renders
  // too late for the recents snapshot, so FLAG_SECURE is held while paused.
  it('holds FLAG_SECURE while paused below API 33 without undoing the screenshot setting', () => {
    const patched = applyRecentsPrivacy(MAIN_ACTIVITY_FIXTURE);
    expect(patched).toContain(`class MainActivity : ReactActivity() {
  // @generated begin canto-legacy-recents-guard`);
    expect(patched).toContain('Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU');
    // Only a flag this guard added is cleared on resume.
    expect(patched).toContain(
      '(window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE) == 0',
    );
    expect(patched).toContain(`if (cantoRecentsSecureAdded) {
      window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)`);
    expect(patched.match(/override fun onPause/g)).toHaveLength(1);
    expect(applyRecentsPrivacy(patched)).toBe(patched);
  });

  it('refuses to guess when MainActivity already handles pause or resume', () => {
    const custom = MAIN_ACTIVITY_FIXTURE.replace(
      '  override fun onCreate',
      '  override fun onResume() { super.onResume() }\n  override fun onCreate',
    );
    expect(() => applyRecentsPrivacy(custom)).toThrow('already overrides onPause/onResume');
    const duplicated = `${applyRecentsPrivacy(MAIN_ACTIVITY_FIXTURE)}\n// @generated begin canto-legacy-recents-guard`;
    expect(() => applyRecentsPrivacy(duplicated)).toThrow(
      'expected at most one legacy block, found 2',
    );
    const noClass = MAIN_ACTIVITY_FIXTURE.replace(
      'class MainActivity : ReactActivity() {',
      'class Other {',
    );
    expect(() => applyRecentsPrivacy(noClass)).toThrow(
      'expected one MainActivity class declaration',
    );
  });
});
