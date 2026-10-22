const { withAppBuildGradle } = require('expo/config-plugins');
const { findNamedBlock, findReleaseBuildType } = require('./gradleBlock');

const RELEASE_SIGNING_BLOCK = `        release {
            storeFile file('upload-keystore.jks')
            storePassword System.getenv("KEYSTORE_PASSWORD") ?: ''
            keyAlias 'upload'
            keyPassword System.getenv("KEY_PASSWORD") ?: ''
        }`;

const DEBUG_SIGNING_BLOCK = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

const DEBUG_RELEASE_SIGNING_ANCHOR = `signingConfig signingConfigs.debug
            def enableShrinkResources`;
const RELEASE_SIGNING_ANCHOR = `signingConfig signingConfigs.release
            def enableShrinkResources`;

function countOccurrences(contents, value) {
  return contents.split(value).length - 1;
}

function applyReleaseSigningConfig(contents) {
  let result = contents;
  let signingConfigsRange;
  try {
    signingConfigsRange = findNamedBlock(result, 'signingConfigs');
  } catch (error) {
    throw new Error(`Unable to configure Android release signing: ${error.message}`);
  }
  let signingConfigsBlock = result.slice(signingConfigsRange.start, signingConfigsRange.end);
  const signingBlockCount = countOccurrences(signingConfigsBlock, RELEASE_SIGNING_BLOCK);
  const credentialMarkerCount = countOccurrences(result, "storeFile file('upload-keystore.jks')");

  if (signingBlockCount > 1 || credentialMarkerCount > 1) {
    throw new Error(
      `Unable to configure Android release signing: expected at most one release signing block, found ${credentialMarkerCount}.`,
    );
  }
  if (signingBlockCount === 0 && credentialMarkerCount !== 0) {
    throw new Error(
      'Unable to configure Android release signing: found a partial or unsupported release signing block.',
    );
  }

  if (signingBlockCount === 0) {
    if (countOccurrences(signingConfigsBlock, DEBUG_SIGNING_BLOCK) !== 1) {
      throw new Error(
        'Unable to configure Android release signing: expected Expo debug signingConfigs block was not found exactly once.',
      );
    }
    signingConfigsBlock = signingConfigsBlock.replace(
      DEBUG_SIGNING_BLOCK,
      `${DEBUG_SIGNING_BLOCK}\n${RELEASE_SIGNING_BLOCK}`,
    );
    result =
      result.slice(0, signingConfigsRange.start) +
      signingConfigsBlock +
      result.slice(signingConfigsRange.end);
  }

  const releaseRange = findReleaseBuildType(result);
  const releaseBlock = result.slice(releaseRange.start, releaseRange.end);
  const debugReleaseAnchorCount = countOccurrences(releaseBlock, DEBUG_RELEASE_SIGNING_ANCHOR);
  const releaseAnchorCount = countOccurrences(releaseBlock, RELEASE_SIGNING_ANCHOR);
  if (debugReleaseAnchorCount === 1 && releaseAnchorCount === 0) {
    const signedReleaseBlock = releaseBlock.replace(
      DEBUG_RELEASE_SIGNING_ANCHOR,
      RELEASE_SIGNING_ANCHOR,
    );
    return (
      result.slice(0, releaseRange.start) + signedReleaseBlock + result.slice(releaseRange.end)
    );
  }
  if (debugReleaseAnchorCount !== 0 || releaseAnchorCount !== 1) {
    throw new Error(
      'Unable to configure Android release signing: expected exactly one signing anchor in the Expo release buildType.',
    );
  }

  return result;
}

function withReleaseSigningConfig(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyReleaseSigningConfig(mod.modResults.contents);
    return mod;
  });
}

module.exports = withReleaseSigningConfig;
module.exports.applyReleaseSigningConfig = applyReleaseSigningConfig;
