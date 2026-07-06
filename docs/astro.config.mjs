// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightContextualMenu from "starlight-contextual-menu";
import starlightLinksValidator from "starlight-links-validator";
import rehypeExternalLinks from "rehype-external-links";
import { unified } from "@astrojs/markdown-remark";

export default defineConfig({
  site: "https://notes.timmo.dev",
  markdown: {
    processor: unified({
      rehypePlugins: [
        [
          rehypeExternalLinks,
          { target: "_blank", rel: ["noopener", "noreferrer"] },
        ],
      ],
    }),
  },
  integrations: [
    sitemap(),
    starlight({
      title: "Notes",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Notes logo",
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/starlight.css"],
      editLink: {
        baseUrl: "https://github.com/timmo001/notes/edit/main/docs/",
      },
      lastUpdated: true,
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://notes.timmo.dev/og.png",
          },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "630" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:alt", content: "Notes" },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://notes.timmo.dev/og.png",
          },
        },
      ],
      plugins: [
        starlightLinksValidator(),
        starlightLlmsTxt({
          projectName: "Notes",
          description:
            "Standalone CLI and MCP server for repo-scoped Markdown notes.",
          promote: ["index*"],
        }),
        starlightContextualMenu({
          actions: ["copy", "view"],
        }),
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/timmo001/notes",
        },
      ],
      sidebar: [
        { label: "Overview", link: "/" },
        { label: "Install", link: "/install/" },
        { label: "Quick Start", link: "/quick-start/" },
        {
          label: "CLI",
          items: [{ autogenerate: { directory: "cli" } }],
        },
        {
          label: "Notes",
          items: [{ autogenerate: { directory: "notes" } }],
        },
        {
          label: "MCP",
          items: [{ autogenerate: { directory: "mcp" } }],
        },
        {
          label: "Integrations",
          items: [{ autogenerate: { directory: "integrations" } }],
        },
      ],
    }),
  ],
});
