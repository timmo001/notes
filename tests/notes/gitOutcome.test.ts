import { describe, expect, test } from "bun:test";
import { noteGitOutcome } from "../../src/notes/gitOutcome.js";

describe("noteGitOutcome", () => {
  test("reports a commit failure as partial success", () => {
    expect(
      noteGitOutcome({
        commit: { ok: false, committed: false, error: "locked" },
      }),
    ).toEqual({
      complete: false,
      detail: "saved locally but git commit failed: locked",
    });
  });

  test("reports a push failure as partial success", () => {
    expect(
      noteGitOutcome({
        commit: { ok: true, committed: true },
        push: { ok: false, message: "", error: "offline" },
      }),
    ).toEqual({
      complete: false,
      detail: "committed locally but push failed: offline",
    });
  });
});
