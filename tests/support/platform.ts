import { NodeServices } from "@effect/platform-node";
import {
  Data,
  Effect,
  FileSystem,
  type Path,
  type PlatformError,
  type Scope,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

type TestServices =
  FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner;

/** Run a test effect against the Node platform services in a fresh scope. */
export function runScoped<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | TestServices>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
}

class CommandFailure extends Data.TaggedError("CommandFailure")<{
  readonly message: string;
}> {}

/** Run a command and return stdout, failing with stderr on a non-zero exit. */
export const commandOutput = Effect.fnUntraced(function* (
  cwd: string,
  command: string,
  args: readonly string[],
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          cwd,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        }),
      );

      const [stdout, stderr, code] = yield* Effect.all(
        [
          child.stdout.pipe(Stream.decodeText(), Stream.mkString),
          child.stderr.pipe(Stream.decodeText(), Stream.mkString),
          child.exitCode,
        ],
        { concurrency: "unbounded" },
      );

      if (code !== 0) return yield* new CommandFailure({ message: stderr });

      return stdout;
    }),
  );
});

/** Run git in a directory and return stdout. */
export function git(cwd: string, args: readonly string[]): Promise<string> {
  return runScoped(commandOutput(cwd, "git", args));
}

/** Run a command in a directory and return stdout. */
export function run(
  cwd: string,
  command: string,
  args: readonly string[],
): Promise<string> {
  return runScoped(commandOutput(cwd, command, args));
}

const withFileSystem = <A>(
  use: (
    fs: FileSystem.FileSystem,
  ) => Effect.Effect<A, PlatformError.PlatformError>,
): Promise<A> =>
  runScoped(Effect.flatMap(FileSystem.FileSystem, (fs) => use(fs)));

/** Create a temporary directory and return its path. */
export function createTempDirectory(
  prefix: string,
  directory?: string,
): Promise<string> {
  return withFileSystem((fs) => fs.makeTempDirectory({ directory, prefix }));
}

/** Create a directory and any missing parents. */
export function makeDirectory(path: string): Promise<void> {
  return withFileSystem((fs) => fs.makeDirectory(path, { recursive: true }));
}

/** Write a text file. */
export function writeTextFile(
  path: string,
  content: string,
  mode?: number,
): Promise<void> {
  return withFileSystem((fs) => fs.writeFileString(path, content, { mode }));
}

/** Read a text file. */
export function readTextFile(path: string): Promise<string> {
  return withFileSystem((fs) => fs.readFileString(path));
}

/** Create a symbolic link at `path` pointing to `target`. */
export function symlinkPath(target: string, path: string): Promise<void> {
  return withFileSystem((fs) => fs.symlink(target, path));
}

/** Change file permissions. */
export function chmodPath(path: string, mode: number): Promise<void> {
  return withFileSystem((fs) => fs.chmod(path, mode));
}

/** Rename a file or directory. */
export function renamePath(from: string, to: string): Promise<void> {
  return withFileSystem((fs) => fs.rename(from, to));
}

/** Recursively remove a path, ignoring missing paths. */
export function removePath(path: string): Promise<void> {
  return withFileSystem((fs) =>
    fs.remove(path, { recursive: true, force: true }),
  );
}

/** Whether a path exists. */
export function pathExists(path: string): Promise<boolean> {
  return withFileSystem((fs) => fs.exists(path));
}

export interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Run a command to completion and return its output and exit code. */
export function runProcess(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Record<string, string | undefined>;
  } = {},
): Promise<ProcessResult> {
  return runScoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const env = Object.fromEntries(
        Object.entries(options.env ?? process.env).flatMap(([key, value]) =>
          value === undefined ? [] : [[key, value]],
        ),
      );

      const child = yield* spawner.spawn(
        ChildProcess.make(command, [...args], {
          cwd: options.cwd,
          env,
          extendEnv: false,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        }),
      );

      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          child.stdout.pipe(Stream.decodeText(), Stream.mkString),
          child.stderr.pipe(Stream.decodeText(), Stream.mkString),
          child.exitCode,
        ],
        { concurrency: "unbounded" },
      );

      return { stdout, stderr, exitCode: Number(exitCode) };
    }),
  );
}

/** Set a file's access and modification times. */
export function utimesPath(
  path: string,
  atime: Date,
  mtime: Date,
): Promise<void> {
  return withFileSystem((fs) => fs.utimes(path, atime, mtime));
}
