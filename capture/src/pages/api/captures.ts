import { env } from "cloudflare:workers";
import { Effect } from "effect";
import type { APIRoute } from "astro";
import { decodeCapture } from "../../capture/schema.js";
import { processCapture } from "../../capture/services/CaptureProcessor.js";
import { createGitHubIssue } from "../../capture/services/GitHubIssues.js";

const MAX_REQUEST_BYTES = 16_384;

function json(data: unknown, status: number): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = (async ({ request }) => {
  if (request.headers.get("Content-Type") !== "application/json") {
    return json({ error: "Expected application/json" }, 415);
  }
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_REQUEST_BYTES) {
    return json({ error: "Capture is too large" }, 413);
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "Capture is too large" }, 413);
    }
    const capture = decodeCapture(JSON.parse(raw));
    const issue = await Effect.runPromise(
      processCapture(capture, {
        queueLabel: env.QUEUE_LABEL,
        createIssue: (payload) =>
          createGitHubIssue(payload, {
            owner: env.GITHUB_OWNER,
            repository: env.GITHUB_REPO,
            token: env.GITHUB_TOKEN,
          }),
      }),
    );
    return json(issue, 201);
  } catch (error) {
    console.error("Capture submission failed", error);
    return json({ error: "The capture could not be queued" }, 400);
  }
}) satisfies APIRoute;
