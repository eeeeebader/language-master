import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

export default withMermaid(
  defineConfig({
    title: "Language Master Docs",
    description: "Product and technical documentation",
    base: "/docs/",
    outDir: "../dist/docs",
    themeConfig: {
      nav: [{ text: "Site", link: "https://languagemaster.app" }],
      sidebar: [
        { text: "Architecture", link: "/architecture" },
        { text: "Offline-first data model", link: "/offline-data" },
        { text: "Story pipeline", link: "/story-pipeline" },
        { text: "Dictionary packs", link: "/dictionary-packs" },
        { text: "Lecture content system", link: "/lectures" },
        { text: "Admin console", link: "/admin" },
        { text: "Legal", link: "/legal" },
      ],
    },
    mermaid: {},
  }),
);
