import { cloudflare } from "@cloudflare/vite-plugin";
import { themeBootScript } from "@timmo001/groundwork-tokens/page";
import { defineConfig } from "vite";
import { themeOptions } from "./src/theme/options.js";

export default defineConfig({
  plugins: [
    {
      // Apply the stored theme before the first paint, so a reload never
      // flashes the wrong colours
      name: "theme-boot",
      transformIndexHtml: () => [
        {
          tag: "script",
          children: themeBootScript(themeOptions),
          injectTo: "head-prepend",
        },
      ],
    },
    cloudflare({
      configPath:
        process.env.CAPTURE_WRANGLER_CONFIG ?? "wrangler.example.jsonc",
    }),
  ],
});
