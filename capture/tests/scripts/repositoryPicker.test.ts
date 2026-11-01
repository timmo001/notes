import { describe, expect, test } from "bun:test";
import { restoreRepository } from "../../src/scripts/repositoryPicker.js";

describe("restoreRepository", () => {
  test("restores only an allowed stored repository", () => {
    const allowed = ["owner/notes", "owner/app"];
    expect(restoreRepository("owner/app", allowed)).toBe("owner/app");
    expect(restoreRepository("owner/old", allowed)).toBe("");
    expect(restoreRepository("", allowed)).toBe("");
    expect(restoreRepository(null, allowed)).toBe("");
  });
});
