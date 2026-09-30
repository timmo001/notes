import { Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { CaptureConfig } from "../config.js";

export interface AccessIdentity {
  readonly subject: string;
  readonly email?: string;
}

export interface AccessConfig {
  readonly audience: string;
  readonly teamDomain: string;
}

export class AccessDenied extends Schema.TaggedError<AccessDenied>()(
  "AccessDenied",
  { cause: Schema.Defect() },
) {}

/** Build a verifier that reuses one Access key set per isolate. */
export function makeAccessVerifier(config: AccessConfig) {
  const issuer = `https://${config.teamDomain}`;
  const keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return Effect.fn("verifyAccessToken")(function* (token: string | undefined) {
    if (!token || config.audience === "configure-after-access-app-creation") {
      return yield* new AccessDenied({
        cause: "Cloudflare Access authentication is not configured",
      });
    }

    const { payload } = yield* Effect.tryPromise({
      try: () => jwtVerify(token, keys, { audience: config.audience, issuer }),
      catch: (cause) => new AccessDenied({ cause }),
    });

    if (!payload.sub) {
      return yield* new AccessDenied({
        cause: "Cloudflare Access token has no subject",
      });
    }

    const email = Schema.decodeUnknownOption(Schema.String)(payload.email);

    return (
      Option.isSome(email)
        ? { subject: payload.sub, email: email.value }
        : { subject: payload.sub }
    ) satisfies AccessIdentity;
  });
}

/** Require a valid Cloudflare Access token on every request outside dev. */
export const AccessMiddleware = HttpRouter.middleware(
  Effect.gen(function* () {
    const { access } = yield* CaptureConfig;
    const verify = makeAccessVerifier(access);

    return (httpEffect) =>
      import.meta.env.DEV
        ? httpEffect
        : Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;

            yield* verify(request.headers["cf-access-jwt-assertion"]);

            return yield* httpEffect;
          }).pipe(
            Effect.catchTag("AccessDenied", () =>
              Effect.succeed(
                HttpServerResponse.text("Unauthorized", { status: 401 }),
              ),
            ),
          );
  }),
  { global: true },
);
