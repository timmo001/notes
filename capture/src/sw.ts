/**
 * The service worker, bundled to `sw.js`: keeps the app shell so the app
 * starts offline. The build sets `GROUNDWORK_PWA_VERSION`, so each build's
 * worker differs from the last, replaces it and its cache, and takes over
 * open pages by itself.
 */
import {
  serveShell,
  type ShellWorkerScope,
} from "@timmo001/groundwork-pwa/worker";
import config from "../pwa.config.ts";

declare const self: ShellWorkerScope;

const api = new URL("api/", self.location.href).href;

serveShell(self, config, {
  version: process.env.GROUNDWORK_PWA_VERSION ?? "dev",
  routes: [
    // The Worker's own routes are live, so they always go to the network
    // rather than being answered from the cache
    ({ request }) => (request.url.startsWith(api) ? fetch(request) : undefined),
  ],
});
