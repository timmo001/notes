import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath:
        process.env.CAPTURE_WRANGLER_CONFIG ?? "wrangler.example.jsonc",
    }),
  ],
});
