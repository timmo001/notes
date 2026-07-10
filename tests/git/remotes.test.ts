import { describe, expect, test } from "bun:test";
import { parseRepositoryRemoteUrl } from "../../src/git/remotes.js";

describe("parseRepositoryRemoteUrl", () => {
  test.each([
    ["git@github.com:timmo001/notes.git", "timmo001", "notes"],
    ["https://github.com/timmo001/notes.git", "timmo001", "notes"],
    ["ssh://git@github.com/timmo001/notes", "timmo001", "notes"],
  ])("parses %s", (remote, owner, repo) => {
    expect(parseRepositoryRemoteUrl(remote)).toEqual({ owner, repo });
  });

  test.each([
    "https://github.com/../../outside.git",
    "https://github.com/timmo001/group/notes.git",
    "https://github.com/timmo001/%2e%2e.git",
    "https://github.com/timmo001%2Foutside/notes.git",
    "git@github.com:../outside.git",
    "not a remote",
  ])("rejects unsafe remote %s", (remote) => {
    expect(parseRepositoryRemoteUrl(remote)).toBeNull();
  });
});
