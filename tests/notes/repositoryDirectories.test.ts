import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRepositoryDirectories,
  rememberRepositoryDirectory,
} from "../../src/notes/repositoryDirectories.js";

describe("repository directories", () => {
  test("persists exact checkout paths by repository slug", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "notes-state-"));
    const first = join(tmpdir(), "first-checkout");
    const second = join(tmpdir(), "second-checkout");

    rememberRepositoryDirectory(stateDir, "owner/first", first);
    rememberRepositoryDirectory(stateDir, "owner/second", second);

    expect(readRepositoryDirectories(stateDir)).toEqual({
      "owner/first": first,
      "owner/second": second,
    });
  });
});
