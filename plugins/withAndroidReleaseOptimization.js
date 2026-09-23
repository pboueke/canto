const fs = require('node:fs');
const path = require('node:path');
const {
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
} = require('expo/config-plugins');
const { findReleaseBuildType } = require('./gradleBlock');

const LEGACY_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZING_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android-optimize.txt")';
const RELEASE_MINIFY_ANCHOR = 'minifyEnabled enableMinifyInReleaseBuilds\n            ';
const OPTIMIZED_RESOURCE_SHRINKING_KEY = 'android.r8.optimizedResourceShrinking';
// Keeping this boundary prevented Expo Record conversion failures in an R8 probe.
// The precise R8 transformation is not yet known; avoid keeping all Expo Records.
const EXPO_RECORD_CONVERTER_KEEP_RULE =
  '-keep class expo.modules.kotlin.records.RecordTypeConverter* { *; }';

function countOccurrences(contents, value) {
  return contents.split(value).length - 1;
}

function applyOptimizingProguardConfig(contents) {
  const legacyCount = countOccurrences(contents, LEGACY_PROGUARD_FILE);
  const optimizingCount = countOccurrences(contents, OPTIMIZING_PROGUARD_FILE);
  const legacyReleaseAnchor = `${RELEASE_MINIFY_ANCHOR}proguardFiles ${LEGACY_PROGUARD_FILE}`;
  const optimizingReleaseAnchor = `${RELEASE_MINIFY_ANCHOR}proguardFiles ${OPTIMIZING_PROGUARD_FILE}`;
  const releaseRange = findReleaseBuildType(contents);
  const releaseBlock = contents.slice(releaseRange.start, releaseRange.end);

  if (legacyCount === 0 && optimizingCount === 1) {
    if (countOccurrences(releaseBlock, optimizingReleaseAnchor) !== 1) {
      throw new Error(
        'Unable to configure R8 optimization: optimizing ProGuard declaration is not in the expected release buildType.',
      );
    }
    return contents;
  }

  if (
    legacyCount !== 1 ||
    optimizingCount !== 0 ||
    countOccurrences(releaseBlock, legacyReleaseAnchor) !== 1
  ) {
    throw new Error(
      `Unable to configure R8 optimization: expected one legacy declaration in the Expo release buildType; found ${legacyCount} legacy and ${optimizingCount} optimizing declarations.`,
    );
  }

  const optimizedReleaseBlock = releaseBlock.replace(legacyReleaseAnchor, optimizingReleaseAnchor);
  return (
    contents.slice(0, releaseRange.start) + optimizedReleaseBlock + contents.slice(releaseRange.end)
  );
}

function upsertOptimizedResourceShrinking(properties) {
  const withoutExisting = properties.filter(
    (entry) => entry.type !== 'property' || entry.key !== OPTIMIZED_RESOURCE_SHRINKING_KEY,
  );
  return [
    ...withoutExisting,
    {
      type: 'property',
      key: OPTIMIZED_RESOURCE_SHRINKING_KEY,
      value: 'true',
    },
  ];
}

function upsertExpoRecordConverterKeepRule(contents) {
  const occurrences = contents
    .split(/\r?\n/)
    .filter((line) => line.trim() === EXPO_RECORD_CONVERTER_KEEP_RULE).length;
  if (occurrences > 1) {
    throw new Error('Unable to configure R8: duplicate Expo Record converter keep rules.');
  }
  if (occurrences === 1) return contents;
  return `${contents.trimEnd()}\n\n# Preserve Expo Record conversion across R8 optimization.\n${EXPO_RECORD_CONVERTER_KEEP_RULE}\n`;
}

function withAndroidReleaseOptimization(config) {
  let nextConfig = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyOptimizingProguardConfig(mod.modResults.contents);
    return mod;
  });

  nextConfig = withGradleProperties(nextConfig, (mod) => {
    mod.modResults = upsertOptimizedResourceShrinking(mod.modResults);
    return mod;
  });

  return withDangerousMod(nextConfig, [
    'android',
    (mod) => {
      const rulesPath = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rules = fs.readFileSync(rulesPath, 'utf8');
      fs.writeFileSync(rulesPath, upsertExpoRecordConverterKeepRule(rules));
      return mod;
    },
  ]);
}

module.exports = withAndroidReleaseOptimization;
module.exports.applyOptimizingProguardConfig = applyOptimizingProguardConfig;
module.exports.upsertOptimizedResourceShrinking = upsertOptimizedResourceShrinking;
module.exports.OPTIMIZED_RESOURCE_SHRINKING_KEY = OPTIMIZED_RESOURCE_SHRINKING_KEY;
module.exports.upsertExpoRecordConverterKeepRule = upsertExpoRecordConverterKeepRule;
module.exports.EXPO_RECORD_CONVERTER_KEEP_RULE = EXPO_RECORD_CONVERTER_KEEP_RULE;
