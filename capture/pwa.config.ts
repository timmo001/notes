/**
 * The app's PWA config: what `@timmo001/groundwork-pwa` gives it. The build
 * writes the manifest from it, and the page and service worker read it.
 */
import { definePwaConfig } from "@timmo001/groundwork-pwa";

export default definePwaConfig({
  name: "Notes Capture",
  shortName: "Capture",
  description: "Capture a note for local OpenCode processing",
  // Text and links shared from other apps arrive in the note, ready to send
  shareTarget: true,
  offline: {
    // The page's own files are cached as they're fetched, since the build
    // hashes their names. This is what starts the app offline before then
    shell: [
      "./",
      "manifest.webmanifest",
      "icons/icon-192.png",
      "icons/icon-512.png",
      "icons/maskable-512.png",
    ],
  },
  manifest: {
    categories: ["productivity", "utilities"],
    // A share opens in the app's window if it's already open, rather than in
    // another
    launch_handler: { client_mode: "navigate-existing" },
  },
});
