import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.languagemaster.client",
  appName: "Language Master",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#FAF8F5",
      showSpinner: false,
      splashFullScreen: false,
    },
    LocalNotifications: { smallIcon: "ic_stat_lm", iconColor: "#5D7A4A" },
    StatusBar: { style: "LIGHT", backgroundColor: "#FAF8F5" },
  },
};

export default config;
