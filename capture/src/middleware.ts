import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";
import { verifyAccessRequest } from "./capture/services/AccessAuth.js";

export const onRequest = defineMiddleware(async ({ request }, next) => {
  if (import.meta.env.DEV) return next();

  try {
    await verifyAccessRequest(request, {
      audience: env.ACCESS_AUD,
      teamDomain: env.ACCESS_TEAM_DOMAIN,
    });
    return next();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
});
