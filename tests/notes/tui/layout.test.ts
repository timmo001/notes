import { describe, expect, test } from "bun:test";
import { measureNotesLayout } from "../../../src/notes/tui/layout.js";

describe("measureNotesLayout", () => {
  test("uses exact split minimums", () => {
    expect(measureNotesLayout(73, 12)).toEqual({
      mode: "split",
      navigationWidth: 30,
      previewWidth: 40,
    });
    expect(measureNotesLayout(72, 12)).toEqual({ mode: "master-detail" });
  });

  test("uses the compact floor", () => {
    expect(measureNotesLayout(32, 12)).toEqual({ mode: "master-detail" });
    expect(measureNotesLayout(31, 12)).toEqual({
      mode: "minimum",
      requiredWidth: 32,
      requiredHeight: 12,
    });
    expect(measureNotesLayout(80, 11)).toEqual({
      mode: "minimum",
      requiredWidth: 32,
      requiredHeight: 12,
    });
  });

  test("keeps the 35/65 split at wide sizes", () => {
    expect(measureNotesLayout(120, 36)).toEqual({
      mode: "split",
      navigationWidth: 40,
      previewWidth: 77,
    });
    expect(measureNotesLayout(80, 24)).toEqual({
      mode: "split",
      navigationWidth: 30,
      previewWidth: 47,
    });
    expect(measureNotesLayout(60, 20)).toEqual({ mode: "master-detail" });
  });
});
