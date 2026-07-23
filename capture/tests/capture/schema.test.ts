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
      repository: "owner/repository",
    });

    expect(capture.text).toBe("Keep this thought");
    expect(capture.source).toBe("speech");
    expect(capture.repository).toBe("owner/repository");
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

  test("trims surrounding whitespace", () => {
    const capture = decodeCapture({
      version: 1,
      requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
      text: "  Keep this thought\n",
      capturedAt: "2026-07-21T12:00:00.000Z",
      source: "text",
    });

    expect(capture.text).toBe("Keep this thought");
  });

  test("checks maximum length after trimming", () => {
    const capture = decodeCapture({
      version: 1,
      requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
      text: ` ${"a".repeat(12_000)} `,
      capturedAt: "2026-07-21T12:00:00.000Z",
      source: "text",
    });

    expect(capture.text).toHaveLength(12_000);
    expect(() =>
      decodeCapture({
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: ` ${"a".repeat(12_001)} `,
        capturedAt: "2026-07-21T12:00:00.000Z",
        source: "text",
      }),
    ).toThrow();
  });
});
