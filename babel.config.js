module.exports = function (api) {
  // Cache per NODE_ENV so dev and release builds get different plugin sets.
  api.cache.using(() => process.env.NODE_ENV);
  const isProduction = process.env.NODE_ENV === "production";
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Release builds: strip console.log/info/debug (scan timings, URIs,
      // model output). error/warn stay so Sentry still gets breadcrumbs.
      ...(isProduction ? [["transform-remove-console", { exclude: ["error", "warn"] }]] : []),
      "react-native-reanimated/plugin",
    ],
  };
};
