import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { headTags, writePwa } from "@timmo001/groundwork-pwa/build";
import { themeBootScript } from "@timmo001/groundwork-tokens/page";
import { build, defineConfig } from "vite";
import config from "./pwa.config.ts";
import { themeOptions } from "./src/theme/options.js";

// Each build has its own version, which the page, the service worker and the
// Worker share. Workers Builds sets the commit; a local build uses the time
const version =
  process.env.GROUNDWORK_PWA_VERSION ??
  process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) ??
  Date.now().toString(36);

const define = {
  "process.env.GROUNDWORK_PWA_VERSION": JSON.stringify(version),
};

const logo = path.join(import.meta.dirname, "public/icons/icon.svg");

export default defineConfig({
  define,
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
    {
      // The PWA's head tags in the page, and with the build the manifest and
      // icons from the config and the logo, and the service worker bundled
      // beside them
      name: "pwa",
      transformIndexHtml: (html) =>
        html.replace("<!-- pwa:head -->", headTags(config)),
      async writeBundle(options) {
        if (this.environment.name !== "client" || options.dir === undefined) {
          return;
        }

        await writePwa(config, { outDir: options.dir, logo });
        await build({
          configFile: false,
          logLevel: "warn",
          publicDir: false,
          define,
          build: {
            outDir: options.dir,
            emptyOutDir: false,
            lib: {
              entry: path.join(import.meta.dirname, "src/sw.ts"),
              formats: ["iife"],
              name: "sw",
              fileName: () => "sw.js",
            },
          },
        });
      },
    },
    cloudflare({
      configPath:
        process.env.CAPTURE_WRANGLER_CONFIG ?? "wrangler.example.jsonc",
    }),
  ],
});
