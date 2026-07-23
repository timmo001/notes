import { env } from "cloudflare:workers";
import { Effect } from "effect";
import type { APIRoute } from "astro";
import {
  parseRepositoryOptions,
  resolveRepository,
  splitRepository,
  type RepositoryOption,
} from "../../capture/repositories.js";
import { CAPTURE_ERRORS } from "../../capture/http.js";
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
    console.warn("Capture submission rejected", {
      reason: "content-type",
      status: 415,
    });
    return json({ error: CAPTURE_ERRORS.expectedJson }, 415);
  }
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_REQUEST_BYTES) {
    console.warn("Capture submission rejected", {
      reason: "declared-size",
      status: 413,
      bytes: length,
    });
    return json({ error: CAPTURE_ERRORS.tooLarge }, 413);
  }

  const raw = await request.text();
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > MAX_REQUEST_BYTES) {
    console.warn("Capture submission rejected", {
      reason: "measured-size",
      status: 413,
      bytes,
    });
    return json({ error: CAPTURE_ERRORS.tooLarge }, 413);
  }

  let capture: Capture;
  try {
    capture = decodeCapture(JSON.parse(raw));
  } catch {
    console.warn("Capture submission rejected", {
      reason: "invalid-capture",
      status: 400,
    });
    return json({ error: CAPTURE_ERRORS.invalidCapture }, 400);
  }

  const defaultRepository = `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
  let repositories: readonly RepositoryOption[] | undefined;
  try {
    repositories = parseRepositoryOptions(env.CAPTURE_REPOSITORIES);
  } catch {
    console.error("Capture submission failed", {
      reason: "repository-configuration",
      status: 500,
      requestId: capture.requestId,
    });
    return json({ error: CAPTURE_ERRORS.invalidConfiguration }, 500);
  }

  let owner: string;
  let repository: string;
  try {
    [owner, repository] = splitRepository(
      resolveRepository(capture.repository, defaultRepository, repositories),
    );
  } catch {
    console.warn("Capture submission rejected", {
      reason: "invalid-repository",
      status: 400,
      requestId: capture.requestId,
    });
    return json({ error: CAPTURE_ERRORS.invalidRepository }, 400);
  }

  try {
    const issue = await Effect.runPromise(
      processCapture(capture, {
        queueLabel: env.QUEUE_LABEL,
        createIssue: (payload) =>
          createGitHubIssue(payload, {
            owner,
            repository,
            token: env.GITHUB_TOKEN,
          }),
      }),
    );
    return json(issue, 201);
  } catch {
    console.error("Capture submission failed", {
      reason: "queue",
      status: 502,
      requestId: capture.requestId,
    });
    return json({ error: CAPTURE_ERRORS.queueFailed }, 502);
  }
}) satisfies APIRoute;
