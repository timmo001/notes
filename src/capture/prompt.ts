import { DateTime } from "effect";
import type { Capture } from "./schema.js";

/** Format a capture as the body consumed by the Notes processing agent. */
export function captureBody(capture: Capture): string {
  return [
    "## Capture",
    "",
    capture.text,
    "",
    "## Metadata",
    "",
    `- Source: ${capture.source}`,
    `- Captured: ${DateTime.formatIso(capture.capturedAt)}`,
    `- Target repository: ${capture.repository ?? "Automatic"}`,
    `- Request: \`${capture.requestId}\``,
  ].join("\n");
}
