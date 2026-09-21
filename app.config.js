const sourceConfig = require('./app.json').expo;

const ANDROID_PLUGINS = [
  [
    'expo-build-properties',
    {
      android: {
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
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
