import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commitIn,
  preflightMutation,
  pushBranch,
} from "../../src/git/committer.js";
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

function gitOutput(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function temporaryBareRepository(): string {
  const directory = mkdtempSync(join(tmpdir(), "notes-git-remote-"));
  temporaryDirectories.push(directory);
  git(directory, "init", "--bare");
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

  test("refuses an in-progress Git operation", async () => {
    const directory = temporaryRepository();
    const marker = gitOutput(
      directory,
      "rev-parse",
      "--git-path",
      "MERGE_HEAD",
    );
    writeFileSync(join(directory, marker), "0".repeat(40));

    const result = await Effect.runPromise(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("Git operation in progress");
  });
});

describe("commitIn", () => {
  test("commits only requested paths", async () => {
    const directory = temporaryRepository();
    writeFileSync(join(directory, "selected.txt"), "before");
    writeFileSync(join(directory, "unrelated.txt"), "before");
    git(directory, "add", ".");
    git(directory, "commit", "-m", "Initial commit");
    writeFileSync(join(directory, "selected.txt"), "selected change");
    writeFileSync(join(directory, "unrelated.txt"), "unrelated change");
    git(directory, "add", ".");

    const result = await Effect.runPromise(
      commitIn({
        cwd: directory,
        message: "Selected change",
        paths: ["selected.txt"],
      }).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result).toMatchObject({ ok: true, committed: true });
    expect(
      gitOutput(directory, "show", "--name-only", "--format=", "HEAD"),
    ).toBe("selected.txt");
    expect(gitOutput(directory, "diff", "--cached", "--name-only")).toBe(
      "unrelated.txt",
    );
  });
});

describe("pushBranch", () => {
  test("uses upstream before origin and installs branch tracking", async () => {
    const directory = temporaryRepository();
    const upstream = temporaryBareRepository();
    const origin = temporaryBareRepository();
    writeFileSync(join(directory, "tracked.txt"), "tracked");
    git(directory, "add", "tracked.txt");
    git(directory, "commit", "-m", "Initial commit");
    git(directory, "remote", "add", "origin", origin);
    git(directory, "remote", "add", "upstream", upstream);
    const branch = gitOutput(directory, "branch", "--show-current");

    const result = await Effect.runPromise(
      pushBranch({ cwd: directory }).pipe(
        Effect.provide(CommandExecutor.layer),
      ),
    );

    expect(result).toEqual({
      ok: true,
      message: `Pushed to upstream/${branch} (new upstream)`,
    });
    expect(
      gitOutput(directory, "rev-parse", "--abbrev-ref", "@{upstream}"),
    ).toBe(`upstream/${branch}`);
    expect(gitOutput(upstream, "rev-parse", `refs/heads/${branch}`)).toBe(
      gitOutput(directory, "rev-parse", "HEAD"),
    );
  });
});
