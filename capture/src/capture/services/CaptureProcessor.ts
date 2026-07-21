import { Effect } from "effect";
import { buildIssuePayload } from "../issuePayload.js";
import type { Capture } from "../schema.js";
import type { CreatedIssue } from "./GitHubIssues.js";

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
    catch: (cause) => new Error("The capture could not be queued", { cause }),
  });
}
