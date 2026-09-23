const sourceConfig = require('./app.json').expo;

const ANDROID_PLUGINS = [
  [
    'expo-build-properties',
    {
      android: {
        // The narrow Expo Record converter keep rule is installed by
        // withAndroidReleaseOptimization. Keep resource shrinking separate
        // until the optimized candidate is verified through Play.
        enableMinifyInReleaseBuilds: true,
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
