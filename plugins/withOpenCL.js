const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withOpenCL(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    if (!application["uses-native-library"]) {
      application["uses-native-library"] = [];
    }

    const alreadyAdded = application["uses-native-library"].some(
      (lib) => lib.$["android:name"] === "libOpenCL.so",
    );

    if (!alreadyAdded) {
      application["uses-native-library"].push({
        $: {
          "android:name": "libOpenCL.so",
          "android:required": "false",
        },
      });
    }

    return config;
  });
};
