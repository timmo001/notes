import { describe, expect, test } from "bun:test";
import { captureBody } from "../../src/capture/prompt.js";
import { decodeCapture } from "../../src/capture/schema.js";

describe("captureBody", () => {
  test("matches the web capture body without its queue marker", () => {
    const body = captureBody(
      decodeCapture({
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: "Keep this thought",
        capturedAt: "2026-07-21T12:00:00.000Z",
        source: "text",
        repository: "owner/repository",
      }),
    );

    expect(body).toContain("## Capture\n\nKeep this thought");
    expect(body).toContain("- Target repository: owner/repository");
    expect(body).toContain("- Request: `019c92df-71d2-7fb0-8c2e-d29f633a355b`");
  });

  test("renders an omitted repository as Automatic", () => {
    const body = captureBody(
      decodeCapture({
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: "Keep this thought",
        capturedAt: "2026-07-21T12:00:00.000Z",
        source: "text",
      }),
    );

    expect(body).toContain("- Target repository: Automatic");
  });
});
