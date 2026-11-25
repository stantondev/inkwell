/**
 * Signs release builds with Inkwell's own key instead of React Native's
 * public debug key (anyone can sign an app with that one, so Android must
 * never be told to trust it with inkwell.social links).
 *
 * The key and its passwords live outside the repo, in ~/.gradle/gradle.properties:
 *   INKWELL_UPLOAD_STORE_FILE, INKWELL_UPLOAD_KEY_ALIAS,
 *   INKWELL_UPLOAD_STORE_PASSWORD, INKWELL_UPLOAD_KEY_PASSWORD
 * Without them, a release build stops with an error rather than quietly
 * falling back to the debug key.
 */
const { withAppBuildGradle } = require("expo/config-plugins");

const RELEASE_CONFIG = `
        release {
            if (!project.hasProperty('INKWELL_UPLOAD_STORE_FILE')) {
                throw new GradleException("Inkwell signing key not set up: add INKWELL_UPLOAD_* to ~/.gradle/gradle.properties (see apps/mobile/plugins/with-release-signing.js)")
            }
            storeFile file(INKWELL_UPLOAD_STORE_FILE)
            storePassword INKWELL_UPLOAD_STORE_PASSWORD
            keyAlias INKWELL_UPLOAD_KEY_ALIAS
            keyPassword INKWELL_UPLOAD_KEY_PASSWORD
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes("INKWELL_UPLOAD_STORE_FILE")) {
      gradle = gradle.replace(/signingConfigs\s*\{\s*\n(\s*debug\s*\{[^}]*\})/, (m) => m + RELEASE_CONFIG);
      // The release build type points at the debug key by default.
      gradle = gradle.replace(
        /(release\s*\{\s*\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
        "$1signingConfig signingConfigs.release",
      );
      if (!gradle.includes("signingConfig signingConfigs.release")) {
        throw new Error("with-release-signing: couldn't find the release build type in app/build.gradle");
      }
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
