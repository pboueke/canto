const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');
const { findReleaseBuildType } = require('./gradleBlock');

const LEGACY_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZING_PROGUARD_FILE = 'getDefaultProguardFile("proguard-android-optimize.txt")';
const RELEASE_MINIFY_ANCHOR = 'minifyEnabled enableMinifyInReleaseBuilds\n            ';
const OPTIMIZED_RESOURCE_SHRINKING_KEY = 'android.r8.optimizedResourceShrinking';

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

function withAndroidReleaseOptimization(config) {
  let nextConfig = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyOptimizingProguardConfig(mod.modResults.contents);
    return mod;
  });

  nextConfig = withGradleProperties(nextConfig, (mod) => {
    mod.modResults = upsertOptimizedResourceShrinking(mod.modResults);
    return mod;
  });

  return nextConfig;
}

module.exports = withAndroidReleaseOptimization;
module.exports.applyOptimizingProguardConfig = applyOptimizingProguardConfig;
module.exports.upsertOptimizedResourceShrinking = upsertOptimizedResourceShrinking;
module.exports.OPTIMIZED_RESOURCE_SHRINKING_KEY = OPTIMIZED_RESOURCE_SHRINKING_KEY;
