import { Context, Effect, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** Domain error for command execution failures. */
export class CommandError extends Schema.TaggedError<CommandError>()(
  "CommandError",
  {
    command: Schema.String,
    exitCode: Schema.Finite,
    stderr: Schema.String,
  },
) {}

/** Service interface for executing subprocess commands via Effect. */
export interface CommandExecutorService {
  /** Run a command and return stdout. Fails on non-zero exit. */
  readonly run: (
    cmd: string,
    args: readonly string[],
    opts?: { readonly cwd?: string },
  ) => Effect.Effect<string, CommandError>;
  /** Run a command and return its exit code without failing on non-zero. */
  readonly exitCode: (
    cmd: string,
    args: readonly string[],
    opts?: { readonly cwd?: string },
  ) => Effect.Effect<number>;
}

const decode = (chunks: readonly Uint8Array[]) =>
  new TextDecoder().decode(Buffer.concat(chunks));

const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => decode([...chunks])));

/** Effect service for executing subprocess commands. */
export class CommandExecutor extends Context.Service<
  CommandExecutor,
  CommandExecutorService
>()("CommandExecutor") {
  static readonly layer = Layer.effect(
    CommandExecutor,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      return CommandExecutor.of({
        run: (cmd, args, opts) => {
          const command = [cmd, ...args].join(" ");

          return Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make(cmd, [...args], {
                cwd: opts?.cwd,
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
              }),
            );

            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                collect(child.stdout),
                collect(child.stderr),
                Effect.orElseSucceed(child.exitCode, () => -1),
              ],
              { concurrency: "unbounded" },
            );

            if (exitCode !== 0) {
              return yield* new CommandError({
                command,
                exitCode,
                stderr: stderr.trim(),
              });
            }

            return stdout;
          }).pipe(
            Effect.scoped,
            Effect.mapError((error) =>
              error instanceof CommandError
                ? error
                : new CommandError({
                    command,
                    exitCode: 1,
                    stderr:
                      error instanceof Error ? error.message : String(error),
                  }),
            ),
          );
        },
        exitCode: (cmd, args, opts) =>
          Effect.gen(function* () {
            const child = yield* spawner.spawn(
              ChildProcess.make(cmd, [...args], {
                cwd: opts?.cwd,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              }),
            );

            return yield* child.exitCode;
          }).pipe(
            Effect.scoped,
            Effect.orElseSucceed(() => 1),
          ),
      });
    }),
  );
}
