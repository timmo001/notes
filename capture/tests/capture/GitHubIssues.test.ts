import { describe, expect, test } from "bun:test";
import { createGitHubIssue } from "../../src/capture/services/GitHubIssues.js";

describe("createGitHubIssue", () => {
  test("maps a successful GitHub response", async () => {
    const issue = await createGitHubIssue(
      { title: "Test", body: "Body", labels: ["agent:ready"] },
      { owner: "owner", repository: "repo", token: "test-token" },
      async () =>
        Response.json({
          number: 7,
          html_url: "https://github.com/o/r/issues/7",
        }),
    );

    expect(issue).toEqual({
      number: 7,
      url: "https://github.com/o/r/issues/7",
    });
  });

  test("does not expose the response body on failure", async () => {
    let message = "";
    try {
      await createGitHubIssue(
        { title: "Test", body: "Body", labels: ["agent:ready"] },
        { owner: "owner", repository: "repo", token: "test-token" },
        async () => new Response("sensitive provider output", { status: 403 }),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("GitHub issue creation failed (403)");
  });
});
