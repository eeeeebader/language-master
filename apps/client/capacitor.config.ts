import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.languagemaster.client",
  appName: "Language Master",
  webDir: "dist",
  server: { androidScheme: "https" },
};

export default config;
