/**
 * The page's PWA connection, made once: registers the service worker, holds
 * the browser's install prompt and hands shares over as a `gw-share` event.
 */
import { connectPwa } from "@timmo001/groundwork-pwa/view";
import config from "../../pwa.config.ts";

export const pwa = connectPwa(config);
