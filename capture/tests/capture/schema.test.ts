import { describe, expect, test } from "bun:test";
import { decodeCapture } from "../../src/capture/schema.js";

describe("decodeCapture", () => {
  test("decodes a valid capture", () => {
    const capture = decodeCapture({
      version: 1,
      requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
      text: "Keep this thought",
      capturedAt: "2026-07-21T12:00:00.000Z",
      source: "speech",
    });

    expect(capture.text).toBe("Keep this thought");
    expect(capture.source).toBe("speech");
  });

  test("rejects empty captures", () => {
    expect(() =>
      decodeCapture({
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: "   ",
        capturedAt: "2026-07-21T12:00:00.000Z",
        source: "text",
      }),
    ).toThrow();
  });
});
