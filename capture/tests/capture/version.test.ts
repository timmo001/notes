import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { requireVersion } from "../../src/api/captures.js";
import { version, versionHeader } from "../../src/capture/version.js";

const run = (headers: Record<string, string>) =>
  Effect.runPromise(
    requireVersion(Effect.succeed(HttpServerResponse.text("ok"))).pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(
          new Request("https://capture.example/api/repositories", { headers }),
        ),
      ),
    ),
  );

describe("requireVersion", () => {
  test("lets the page's own version, and a request without one, through", async () => {
    expect((await run({ [versionHeader]: version })).status).toBe(200);
    expect((await run({})).status).toBe(200);
  });

  test("refuses another version with 426", async () => {
    expect((await run({ [versionHeader]: `${version}-old` })).status).toBe(426);
  });
});
