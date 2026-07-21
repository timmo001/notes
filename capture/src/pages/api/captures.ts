import { env } from "cloudflare:workers";
import { Effect } from "effect";
import type { APIRoute } from "astro";
import { decodeCapture, type Capture } from "../../capture/schema.js";
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

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "Capture is too large" }, 413);
  }

  let capture: Capture;
  try {
    capture = decodeCapture(JSON.parse(raw));
  } catch {
    return json({ error: "Invalid capture" }, 400);
  }

  try {
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
    console.error("Capture submission failed", {
      requestId: capture.requestId,
    });
    return json({ error: "The capture could not be queued" }, 502);
  }
}) satisfies APIRoute;
