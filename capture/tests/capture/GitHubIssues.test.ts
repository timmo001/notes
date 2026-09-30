import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { CaptureConfig } from "../../src/capture/config.js";
import { GitHubIssues } from "../../src/capture/services/GitHubIssues.js";

const env = {
  ACCESS_AUD: "development",
  ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_TOKEN: "test-token",
  QUEUE_LABEL: "agent:ready",
};

function createIssue(respond: () => Promise<Response>) {
  return GitHubIssues.use((issues) =>
    issues.create({ title: "Test", body: "Body", labels: ["agent:ready"] }),
  ).pipe(
    Effect.provide(
      GitHubIssues.layer.pipe(
        Layer.provide([CaptureConfig.layer(env), FetchHttpClient.layer]),
      ),
    ),
    Effect.provideService(
      FetchHttpClient.Fetch,
      Object.assign(respond, { preconnect: fetch.preconnect }),
    ),
  );
}

describe("GitHubIssues", () => {
  test("maps a successful GitHub response", async () => {
    const issue = await Effect.runPromise(
      createIssue(async () =>
        Response.json({
          number: 7,
          html_url: "https://github.com/o/r/issues/7",
        }),
      ),
    );

    expect(issue).toEqual({
      number: 7,
      url: "https://github.com/o/r/issues/7",
    });
  });

  test("does not expose the response body on failure", async () => {
    const error = await Effect.runPromise(
      createIssue(
        async () => new Response("sensitive provider output", { status: 403 }),
      ).pipe(Effect.flip),
    );

    expect(error.message).toBe("GitHub issue creation failed (403)");
  });
});
