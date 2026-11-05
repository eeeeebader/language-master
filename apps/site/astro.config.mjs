import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://languagemaster.app",
  outDir: "dist",
  vite: { plugins: [tailwindcss()] },
});
