const { withAppBuildGradle } = require('expo/config-plugins');
const { findNamedBlock } = require('./gradleBlock');

const DEBUG_APPLICATION_ID_SUFFIX = "applicationIdSuffix '.debug'";

function countDebugSuffixes(contents) {
  return [...contents.matchAll(/applicationIdSuffix\s+['"]\.debug['"]/g)].length;
}

function applyDebugApplicationIdSuffix(contents) {
  let debugRange;
  try {
    const buildTypesRange = findNamedBlock(contents, 'buildTypes');
    debugRange = findNamedBlock(
      contents,
      'debug',
      buildTypesRange.openBrace + 1,
      buildTypesRange.end - 1,
    );
  } catch (error) {
    throw new Error(`Unable to configure Android debug application ID: ${error.message}`);
  }

  const debugBlock = contents.slice(debugRange.start, debugRange.end);
  const totalSuffixCount = countDebugSuffixes(contents);
  const debugSuffixCount = countDebugSuffixes(debugBlock);

  if (debugSuffixCount === 1 && totalSuffixCount === 1) return contents;
  if (debugSuffixCount !== 0 || totalSuffixCount !== 0) {
    throw new Error(
      'Unable to configure Android debug application ID: found a .debug applicationIdSuffix outside the debug buildType or more than once.',
    );
  }

  const openBraceOffset = debugBlock.indexOf('{') + 1;
  const updatedDebugBlock = `${debugBlock.slice(0, openBraceOffset)}\n            ${DEBUG_APPLICATION_ID_SUFFIX}${debugBlock.slice(openBraceOffset)}`;

  return contents.slice(0, debugRange.start) + updatedDebugBlock + contents.slice(debugRange.end);
}

function withAndroidDebugApplicationId(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = applyDebugApplicationIdSuffix(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidDebugApplicationId;
module.exports.applyDebugApplicationIdSuffix = applyDebugApplicationIdSuffix;
