const { withAppBuildGradle } = require('expo/config-plugins');

/** @type {import('expo/config').ExpoConfig} */
const config = require('./app.json').expo;

/**
 * Config plugin that patches android/app/build.gradle to use a release
 * signing config (upload-keystore.jks) with env-var passwords, so that
 * `npx expo prebuild --clean` preserves the production signing setup.
 */
const withReleaseSigningConfig = (expoConfig) => {
  return withAppBuildGradle(expoConfig, (mod) => {
    let contents = mod.modResults.contents;

    if (contents.includes('signingConfigs.release')) {
      return mod;
    }

    // 1. Add release signingConfig block after the debug signingConfig closing brace
    const debugSigningEnd = "keyPassword 'android'\n        }";
    contents = contents.replace(
      debugSigningEnd,
      debugSigningEnd +
        `\n        release {\n` +
        `            storeFile file('upload-keystore.jks')\n` +
        `            storePassword System.getenv("KEYSTORE_PASSWORD") ?: ''\n` +
        `            keyAlias 'upload'\n` +
        `            keyPassword System.getenv("KEY_PASSWORD") ?: ''\n` +
        `        }`
    );

    // 2. Point release buildType to signingConfigs.release
    contents = contents.replace(
      'signingConfig signingConfigs.debug\n' +
        "            def enableShrinkResources",
      'signingConfig signingConfigs.release\n' +
        "            def enableShrinkResources"
    );

    mod.modResults.contents = contents;
    return mod;
  });
};

module.exports = withReleaseSigningConfig(config);
