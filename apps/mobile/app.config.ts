import type { ExpoConfig } from "expo/config";

/**
 * Inkwell for Android (iOS later): a native frame around inkwell.social.
 *
 * EXPO_PUBLIC_INKWELL_URL points the app at another server for testing
 * (e.g. http://localhost:3500 through `adb reverse`); plain-http addresses
 * are only allowed in builds made with that variable set.
 */
const siteUrl = process.env.EXPO_PUBLIC_INKWELL_URL ?? "https://inkwell.social";
const testing = siteUrl.startsWith("http://");

const config: ExpoConfig = {
  name: "Inkwell",
  slug: "inkwell",
  scheme: "inkwell",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#ffffff",
  android: {
    package: "social.inkwell.app",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#ffffff",
      foregroundImage: "./assets/android-icon-foreground.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    softwareKeyboardLayoutMode: "resize",
    // Firebase (notifications). It ships inside the app, so it isn't secret,
    // but it's kept out of the repo (GitHub flags the API key in it) next to
    // the signing key. Its key is restricted in Google Cloud to this app.
    googleServicesFile:
      process.env.INKWELL_GOOGLE_SERVICES ?? `${process.env.HOME}/.inkwell-android/google-services.json`,
    predictiveBackGestureEnabled: false,
    // Links to inkwell.social open in the app (sign-in links from email
    // included). Verified through /.well-known/assetlinks.json.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "inkwell.social" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  ios: {
    bundleIdentifier: "social.inkwell.app",
    supportsTablet: true,
  },
  plugins: [
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 280,
        backgroundColor: "#ffffff",
        dark: { image: "./assets/splash-icon-dark.png", backgroundColor: "#1c1917" },
      },
    ],
    "expo-web-browser",
    [
      "expo-notifications",
      { icon: "./assets/notification-icon.png", color: "#2d4a8a", defaultChannel: "default" },
    ],
    ["expo-build-properties", { android: { usesCleartextTraffic: testing } }],
    "./plugins/with-release-signing",
  ],
  extra: { siteUrl },
};

export default config;
