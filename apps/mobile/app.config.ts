const env = process.env.EXPO_PUBLIC_ENV;
const bundleIdentifier = env
  ? `sh.nitish.stockpile.app.${env}`
  : `sh.nitish.stockpile.app`;
const scheme = env ? `stockpile${env}` : `stockpile`;

const name = env ? `Stockpile (${env.toUpperCase()})` : "Stockpile";

// Release builds block cleartext HTTP. Allow it only when the configured API is plain http
// (local/LAN testing); https deployments keep Android's default strict policy.
const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4040";
const allowCleartext = apiUrl.trim().toLowerCase().startsWith("http://");

const config = {
  expo: {
    name: name,
    slug: "stockpile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: scheme,
    userInterfaceStyle: "light",
    backgroundColor: "#F5F2EA",
    newArchEnabled: true,
    runtimeVersion: {
      policy: "appVersion",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: bundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "This app does not use your location.",
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      package: bundleIdentifier,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#F5F2EA",
        },
      ],

      [
        "expo-secure-store",
        {
          configureAndroidBackup: true,
          faceIDPermission:
            "Allow $(PRODUCT_NAME) to access your Face ID biometric data.",
        },
      ],
      "expo-web-browser",
      "expo-sqlite",
      "react-native-cloud-storage",
      "react-native-edge-to-edge",
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.4",
          },
          // Android SDK levels follow React Native 0.85 defaults (compile/target 36).
          android: {
            usesCleartextTraffic: allowCleartext,
          },
        },
      ],
      ["expo-font"],
      "@react-native-community/datetimepicker",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      ...(process.env.EAS_PROJECT_ID
        ? { eas: { projectId: process.env.EAS_PROJECT_ID } }
        : {}),
    },
    owner: "slashforge",
  },
};

export default config;
