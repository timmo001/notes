import { Effect, Schema } from "effect";
import { buildIssuePayload } from "../issuePayload.js";
import type { Capture } from "../schema.js";
import type { CreatedIssue } from "./GitHubIssues.js";

/** Domain error for a capture that could not be queued. */
export class CaptureQueueError extends Schema.TaggedError<CaptureQueueError>()(
  "CaptureQueueError",
  { message: Schema.String, cause: Schema.Unknown },
) {}

export interface CaptureProcessorConfig {
  readonly queueLabel: string;
  readonly createIssue: (
    payload: ReturnType<typeof buildIssuePayload>,
  ) => Promise<CreatedIssue>;
}

export function processCapture(
  capture: Capture,
  config: CaptureProcessorConfig,
) {
  return Effect.tryPromise({
    try: () =>
      config.createIssue(buildIssuePayload(capture, config.queueLabel)),
    catch: (cause) =>
      new CaptureQueueError({
        message: "The capture could not be queued",
        cause,
      }),
  });
}
