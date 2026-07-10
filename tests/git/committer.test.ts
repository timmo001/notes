import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preflightMutation } from "../../src/git/committer.js";
import { CommandExecutor } from "../../src/services/CommandExecutor.js";

const temporaryDirectories: string[] = [];

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function temporaryRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "notes-git-"));
  temporaryDirectories.push(directory);
  git(directory, "init");
  git(directory, "config", "user.name", "Notes Test");
  git(directory, "config", "user.email", "notes@example.invalid");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("preflightMutation", () => {
  test("refuses an existing staged change", async () => {
    const directory = temporaryRepository();
    writeFileSync(join(directory, "staged.txt"), "unfinished");
    git(directory, "add", "staged.txt");
    const result = await Effect.runPromise(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );
    expect(result.ok).toBeFalse();
    expect(result.error).toContain("staged changes");
  });

  test("allows a repository with an empty index", async () => {
    const directory = temporaryRepository();
    const result = await Effect.runPromise(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );
    expect(result.ok).toBeTrue();
  });

  test("refuses detached HEAD", async () => {
    const directory = temporaryRepository();
    writeFileSync(join(directory, "tracked.txt"), "tracked");
    git(directory, "add", "tracked.txt");
    git(directory, "commit", "-m", "Initial commit");
    git(directory, "checkout", "--detach");
    const result = await Effect.runPromise(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );
    expect(result.ok).toBeFalse();
    expect(result.error).toContain("detached HEAD");
  });
});
