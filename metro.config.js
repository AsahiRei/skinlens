const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// register .tflite so Metro bundles it as an asset (like images/fonts) instead of trying to parse it as source
config.resolver.assetExts.push("tflite");

module.exports = withNativewind(config);