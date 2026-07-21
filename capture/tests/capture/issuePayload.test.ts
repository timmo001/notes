import { describe, expect, test } from "bun:test";
import { DateTime } from "effect";
import { buildIssuePayload } from "../../src/capture/issuePayload.js";

describe("buildIssuePayload", () => {
  test("creates a deterministic labelled issue", () => {
    const payload = buildIssuePayload(
      {
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: "Investigate this idea",
        capturedAt: DateTime.makeUnsafe("2026-07-21T12:00:00.000Z"),
        source: "text",
      },
      "agent:ready",
    );

    expect(payload.title).toBe("Investigate this idea");
    expect(payload.labels).toEqual(["agent:ready"]);
    expect(payload.body).toContain("notes-capture:019c92df");
  });
});
