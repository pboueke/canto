const sourceConfig = require('./app.json').expo;

const ANDROID_PLUGINS = [
  [
    'expo-build-properties',
    {
      android: {
        // R8 in the published 0.20.1 bundle breaks Expo Record conversion
        // (SecureStoreOptions and DocumentPickerOptions). Keep release mode,
        // but do not shrink code/resources until a targeted R8 fix is tested
        // on a Play-installed build.
        enableMinifyInReleaseBuilds: false,
        enableShrinkResourcesInReleaseBuilds: false,
      },
    },
  ],
  './plugins/withAndroidDebugApplicationId',
  './plugins/withReleaseSigningConfig',
  './plugins/withAndroidReleaseOptimization',
  './plugins/withCantoArchive',
];

function pluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

const androidPluginNames = new Set(ANDROID_PLUGINS.map(pluginName));
const plugins = [
  ...(sourceConfig.plugins ?? []).filter((plugin) => !androidPluginNames.has(pluginName(plugin))),
  ...ANDROID_PLUGINS,
];

/** @type {import('expo/config').ExpoConfig} */
const config = {
  ...sourceConfig,
  plugins,
};

module.exports = config;
