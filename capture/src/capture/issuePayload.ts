import type { Capture } from "./schema.js";
import { DateTime } from "effect";

const REQUEST_MARKER_PREFIX = "<!-- notes-capture:";

export interface IssuePayload {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly [string];
}

function defaultTitle(text: string): string {
  const firstLine = text.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length <= 72) return firstLine;
  return `${firstLine.slice(0, 69).trimEnd()}...`;
}

export function buildIssuePayload(
  capture: Capture,
  queueLabel: string,
): IssuePayload {
  const title = capture.titleHint?.trim() || defaultTitle(capture.text);
  return {
    title,
    labels: [queueLabel],
    body: [
      `${REQUEST_MARKER_PREFIX}${capture.requestId} -->`,
      "## Capture",
      "",
      capture.text,
      "",
      "## Metadata",
      "",
      `- Source: ${capture.source}`,
      `- Captured: ${DateTime.formatIso(capture.capturedAt)}`,
      `- Request: \`${capture.requestId}\``,
    ].join("\n"),
  };
}
