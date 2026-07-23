import { describe, expect, test } from "bun:test";
import {
  CAPTURE_ERRORS,
  captureErrorMessage,
  decodeCaptureError,
  GENERIC_CAPTURE_ERROR,
} from "../../src/capture/http.js";

describe("decodeCaptureError", () => {
  test("decodes every public capture error", () => {
    for (const error of Object.values(CAPTURE_ERRORS)) {
      expect(decodeCaptureError({ error })).toBe(error);
    }
  });

  test("rejects malformed and unknown errors", () => {
    expect(decodeCaptureError(null)).toBeUndefined();
    expect(decodeCaptureError({})).toBeUndefined();
    expect(decodeCaptureError({ error: 400 })).toBeUndefined();
    expect(
      decodeCaptureError({ error: "Provider token expired" }),
    ).toBeUndefined();
  });
});

describe("captureErrorMessage", () => {
  test("keeps known API errors and preserves the capture", () => {
    expect(captureErrorMessage({ error: CAPTURE_ERRORS.invalidCapture })).toBe(
      "Invalid capture. Your text is still here.",
    );
  });

  test("uses the generic message for untrusted responses", () => {
    expect(captureErrorMessage(undefined)).toBe(GENERIC_CAPTURE_ERROR);
    expect(captureErrorMessage("not JSON")).toBe(GENERIC_CAPTURE_ERROR);
    expect(captureErrorMessage({ error: "Provider token expired" })).toBe(
      GENERIC_CAPTURE_ERROR,
    );
  });
});
