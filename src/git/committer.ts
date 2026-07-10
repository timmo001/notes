import { Effect } from "effect";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { gitExitCode, gitOutput } from "../lib/git.js";
import { CommandExecutor } from "../services/CommandExecutor.js";
import { resolveDefaultRemote } from "./remotes.js";

/** Whether a git subprocess inherits terminal output or captures it. */
export type GitIo = "capture";

/** A git command's outcome expressed as a value, never a failed Effect. */
export interface GitStepResult {
  /** Whether the command exited zero. */
  readonly ok: boolean;
  /** Trimmed captured output. */
  readonly text: string;
  /** Failure message when `ok` is false. */
  readonly error?: string;
}

function readGitIn(
  cwd: string | undefined,
  args: readonly string[],
): Effect.Effect<string, never, CommandExecutor> {
  return gitOutput(args, cwd ? { cwd } : undefined).pipe(
    Effect.map((output) => output.trim()),
    Effect.catch(() => Effect.succeed("")),
  );
}

function runStep(
  cwd: string | undefined,
  args: readonly string[],
): Effect.Effect<GitStepResult, never, CommandExecutor> {
  return gitOutput(args, cwd ? { cwd } : undefined).pipe(
    Effect.map((text): GitStepResult => ({ ok: true, text: text.trim() })),
    Effect.catch((error) =>
      Effect.succeed<GitStepResult>({
        ok: false,
        text: "",
        error: error.message,
      }),
    ),
  );
}

/** Whether the index holds staged changes. */
export function hasStagedChanges(
  cwd?: string,
  paths: readonly string[] = [],
): Effect.Effect<boolean, never, CommandExecutor> {
  return gitExitCode(
    ["diff", "--cached", "--quiet", ...(paths.length ? ["--", ...paths] : [])],
    cwd ? { cwd } : undefined,
  ).pipe(Effect.map((code) => code !== 0));
}

/** Ensure `cwd` is a git worktree, running `git init` when needed. */
export function ensureRepo(
  cwd?: string,
): Effect.Effect<GitStepResult, never, CommandExecutor> {
  return Effect.gen(function* () {
    const inside = yield* readGitIn(cwd, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    if (inside === "true") return { ok: true, text: "" };
    return yield* runStep(cwd, ["init"]);
  });
}

/** How to stage before committing: everything, or a set of pathspecs. */
export type StageSpec =
  | { readonly mode: "all" }
  | { readonly mode: "paths"; readonly paths: readonly string[] };

/** Stage changes with `git add`, capturing failures as a value. */
export function stageIn(
  spec: StageSpec,
  opts?: { readonly cwd?: string; readonly io?: GitIo },
): Effect.Effect<GitStepResult, never, CommandExecutor> {
  if (spec.mode === "paths" && spec.paths.length === 0) {
    return Effect.succeed({ ok: true, text: "" });
  }
  const args =
    spec.mode === "all" ? ["add", "-A"] : ["add", "--", ...spec.paths];
  return runStep(opts?.cwd, args);
}

/** A commit request against a single repository. */
export interface CommitStep {
  readonly cwd?: string;
  readonly message?: string;
  readonly noVerify?: boolean;
  readonly io?: GitIo;
  readonly tolerateEmpty?: boolean;
  readonly paths?: readonly string[];
}

/** The result of a commit request. */
export interface CommitOutcome {
  readonly ok: boolean;
  readonly committed: boolean;
  readonly text: string;
  readonly error?: string;
}

/** Commit already-staged changes, optionally tolerating an empty index. */
export function commitIn(
  step: CommitStep,
): Effect.Effect<CommitOutcome, never, CommandExecutor> {
  return Effect.gen(function* () {
    if (step.tolerateEmpty) {
      const staged = yield* hasStagedChanges(step.cwd, step.paths);
      if (!staged)
        return { ok: true, committed: false, text: "nothing to commit" };
    }
    const args = [
      "commit",
      ...(step.message !== undefined ? ["-m", step.message] : []),
      ...(step.noVerify ? ["--no-verify"] : []),
      ...(step.paths?.length ? ["--only", "--", ...step.paths] : []),
    ];
    const result = yield* runStep(step.cwd, args);
    return result.ok
      ? { ok: true, committed: true, text: result.text }
      : { ok: false, committed: false, text: result.text, error: result.error };
  });
}

/** The result of pushing a branch. */
export interface PushOutcome {
  readonly ok: boolean;
  readonly message: string;
  readonly error?: string;
}

/** Refuse a dirty index and integrate upstream changes before note I/O. */
export function preflightMutation(
  cwd?: string,
): Effect.Effect<GitStepResult, never, CommandExecutor> {
  const opts = cwd ? { cwd } : undefined;
  return Effect.gen(function* () {
    const stagedCode = yield* gitExitCode(
      ["diff", "--cached", "--quiet"],
      opts,
    );
    if (stagedCode > 1) {
      return {
        ok: false,
        text: "",
        error: `Unable to inspect staged changes (git exited ${stagedCode}).`,
      };
    }
    if (stagedCode === 1) {
      return {
        ok: false,
        text: "",
        error:
          "The notes repository already has staged changes. Commit or unstage them before changing a note.",
      };
    }

    for (const marker of [
      "rebase-merge",
      "rebase-apply",
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
    ]) {
      const markerPath = yield* readGitIn(cwd, [
        "rev-parse",
        "--git-path",
        marker,
      ]);
      if (
        markerPath &&
        existsSync(
          isAbsolute(markerPath)
            ? markerPath
            : resolve(cwd ?? process.cwd(), markerPath),
        )
      ) {
        return {
          ok: false,
          text: "",
          error:
            "The notes repository already has a Git operation in progress.",
        };
      }
    }

    const branch = yield* runStep(cwd, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ]);
    if (!branch.ok) {
      return {
        ok: false,
        text: "",
        error: "The notes repository is in detached HEAD state.",
      };
    }
    const upstream = yield* readGitIn(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    if (!upstream) return { ok: true, text: "" };

    const pulled = yield* runStep(cwd, [
      "pull",
      "--rebase",
      "--no-autostash",
      "--no-edit",
    ]);
    if (pulled.ok) return pulled;
    yield* gitExitCode(["rebase", "--abort"], opts);
    return {
      ok: false,
      text: "",
      error:
        pulled.error ??
        "Could not rebase the notes repository before changing the note.",
    };
  });
}

/** Push the current branch, rebasing onto its upstream first when needed. */
export function pushBranch(
  options: {
    readonly cwd?: string;
    readonly io?: GitIo;
  } = {},
): Effect.Effect<PushOutcome, never, CommandExecutor> {
  const { cwd } = options;
  return Effect.gen(function* () {
    const branch = yield* readGitIn(cwd, ["branch", "--show-current"]);
    if (!branch) {
      return {
        ok: false,
        message: "",
        error: "Cannot push from a detached HEAD.",
      };
    }
    const upstream = yield* readGitIn(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    if (upstream) {
      const pushed = yield* runStep(cwd, ["push"]);
      return pushed.ok
        ? { ok: true, message: `Pushed to ${upstream}` }
        : { ok: false, message: "", error: pushed.error };
    }
    const { remote } = resolveDefaultRemote(yield* readGitIn(cwd, ["remote"]));
    const pushed = yield* runStep(cwd, ["push", "-u", remote, branch]);
    return pushed.ok
      ? { ok: true, message: `Pushed to ${remote}/${branch} (new upstream)` }
      : { ok: false, message: "", error: pushed.error };
  });
}
