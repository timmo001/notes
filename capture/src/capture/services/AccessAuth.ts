import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AccessIdentity {
  readonly subject: string;
  readonly email?: string;
}

export interface AccessConfig {
  readonly audience: string;
  readonly teamDomain: string;
}

export async function verifyAccessRequest(
  request: Request,
  config: AccessConfig,
): Promise<AccessIdentity> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || config.audience === "configure-after-access-app-creation") {
    throw new Error("Cloudflare Access authentication is not configured");
  }

  const issuer = `https://${config.teamDomain}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  const { payload } = await jwtVerify(token, keys, {
    audience: config.audience,
    issuer,
  });
  if (!payload.sub) throw new Error("Cloudflare Access token has no subject");

  return typeof payload.email === "string"
    ? { subject: payload.sub, email: payload.email }
    : { subject: payload.sub };
}
