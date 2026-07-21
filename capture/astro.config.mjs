import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

const configPath =
  process.env.CAPTURE_WRANGLER_CONFIG ?? "wrangler.example.jsonc";

export default defineConfig({
  adapter: cloudflare({
    configPath,
    imageService: "passthrough",
  }),
  output: "server",
});
