// Renders the PNG branding from src/assets/logo.svg. Run with: bun run brand
import { writeBrandImages } from "@timmo001/docs-kit";

const written = await writeBrandImages({
  logo: "src/assets/logo.svg",
  title: "Notes",
  tagline: ["Repo-scoped Markdown notes", "for humans and agents."],
  site: "notes.timmo.dev",
  background: "#18181b",
  accent: "#4f9cff",
  outputs: {
    socialPreview: "../.github/social-preview.png",
    logo: "public/logo.png",
    appleTouchIcon: "public/apple-touch-icon.png",
  },
});

for (const file of written) console.log(`Wrote ${file}`);
