import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { join } from "node:path";
import {
  commitIn,
  preflightMutation,
  pushBranch,
} from "../../src/git/committer.js";
import { CommandExecutor } from "../../src/services/CommandExecutor.js";
import {
  git as runGit,
  createTempDirectory,
  removePath,
  runScoped,
  writeTextFile,
} from "../support/platform.js";

const temporaryDirectories: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<void> {
  await runGit(cwd, args);
}

async function temporaryRepository(): Promise<string> {
  const directory = await createTempDirectory("notes-git-");
  temporaryDirectories.push(directory);
  await git(directory, "init");
  await git(directory, "config", "user.name", "Notes Test");
  await git(directory, "config", "user.email", "notes@example.invalid");

  return directory;
}

async function gitOutput(cwd: string, ...args: string[]): Promise<string> {
  return (await runGit(cwd, args)).trim();
}

async function temporaryBareRepository(): Promise<string> {
  const directory = await createTempDirectory("notes-git-remote-");
  temporaryDirectories.push(directory);
  await git(directory, "init", "--bare");

  return directory;
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removePath(directory);
});

describe("preflightMutation", () => {
  test("refuses an existing staged change", async () => {
    const directory = await temporaryRepository();
    await writeTextFile(join(directory, "staged.txt"), "unfinished");
    await git(directory, "add", "staged.txt");

    const result = await runScoped(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("staged changes");
  });

  test("allows a repository with an empty index", async () => {
    const directory = await temporaryRepository();

    const result = await runScoped(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result.ok).toBeTrue();
  });

  test("refuses detached HEAD", async () => {
    const directory = await temporaryRepository();
    await writeTextFile(join(directory, "tracked.txt"), "tracked");
    await git(directory, "add", "tracked.txt");
    await git(directory, "commit", "-m", "Initial commit");
    await git(directory, "checkout", "--detach");

    const result = await runScoped(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("detached HEAD");
  });

  test("refuses an in-progress Git operation", async () => {
    const directory = await temporaryRepository();

    const marker = await gitOutput(
      directory,
      "rev-parse",
      "--git-path",
      "MERGE_HEAD",
    );

    await writeTextFile(join(directory, marker), "0".repeat(40));

    const result = await runScoped(
      preflightMutation(directory).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("Git operation in progress");
  });
});

describe("commitIn", () => {
  test("commits only requested paths", async () => {
    const directory = await temporaryRepository();
    await writeTextFile(join(directory, "selected.txt"), "before");
    await writeTextFile(join(directory, "unrelated.txt"), "before");
    await git(directory, "add", ".");
    await git(directory, "commit", "-m", "Initial commit");
    await writeTextFile(join(directory, "selected.txt"), "selected change");
    await writeTextFile(join(directory, "unrelated.txt"), "unrelated change");
    await git(directory, "add", ".");

    const result = await runScoped(
      commitIn({
        cwd: directory,
        message: "Selected change",
        paths: ["selected.txt"],
      }).pipe(Effect.provide(CommandExecutor.layer)),
    );

    expect(result).toMatchObject({ ok: true, committed: true });
    expect(
      await gitOutput(directory, "show", "--name-only", "--format=", "HEAD"),
    ).toBe("selected.txt");
    expect(await gitOutput(directory, "diff", "--cached", "--name-only")).toBe(
      "unrelated.txt",
    );
  });
});

describe("pushBranch", () => {
  test("uses upstream before origin and installs branch tracking", async () => {
    const directory = await temporaryRepository();
    const upstream = await temporaryBareRepository();
    const origin = await temporaryBareRepository();
    await writeTextFile(join(directory, "tracked.txt"), "tracked");
    await git(directory, "add", "tracked.txt");
    await git(directory, "commit", "-m", "Initial commit");
    await git(directory, "remote", "add", "origin", origin);
    await git(directory, "remote", "add", "upstream", upstream);
    const branch = await gitOutput(directory, "branch", "--show-current");

    const result = await runScoped(
      pushBranch({ cwd: directory }).pipe(
        Effect.provide(CommandExecutor.layer),
      ),
    );

    expect(result).toEqual({
      ok: true,
      message: `Pushed to upstream/${branch} (new upstream)`,
    });
    expect(
      await gitOutput(directory, "rev-parse", "--abbrev-ref", "@{upstream}"),
    ).toBe(`upstream/${branch}`);
    expect(await gitOutput(upstream, "rev-parse", `refs/heads/${branch}`)).toBe(
      await gitOutput(directory, "rev-parse", "HEAD"),
    );
  });
});
