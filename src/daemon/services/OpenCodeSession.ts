import { Effect, Redacted, Schedule, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { resolve } from "node:path";
import type { DaemonConfig } from "../schema.js";

const Rules = Schema.Array(
  Schema.Struct({
    action: Schema.NonEmptyString,
    resource: Schema.NonEmptyString,
    effect: Schema.Literals(["allow", "deny", "ask"]),
  }),
);

const Agents = Schema.Struct({
  location: Schema.Struct({ directory: Schema.String }),
  data: Schema.Array(Schema.Struct({ id: Schema.String, permissions: Rules })),
});

const Session = Schema.Struct({
  data: Schema.Struct({
    id: Schema.String.check(Schema.isPattern(/^ses_[a-zA-Z0-9]+$/)),
    agent: Schema.String,
    location: Schema.Struct({ directory: Schema.String }),
    permissions: Rules,
  }),
});

/** Failure to establish a capture session's permission policy. */
export class OpenCodeSessionError extends Schema.TaggedError<OpenCodeSessionError>()(
  "OpenCodeSessionError",
  { message: Schema.String },
) {}

/** Keep setup and model commands on the same launcher and process boundary. */
export function openCodeCommand(
  config: DaemonConfig,
  args: readonly string[],
  password?: Redacted.Redacted<string>,
) {
  return ChildProcess.make(
    config.opencodeCommand ?? "opencode2",
    [...(config.opencodeArgs ?? []), ...args],
    {
      cwd: config.opencodeDirectory,
      env: {
        PWD: resolve(config.opencodeDirectory),
        OPENCODE_PASSWORD: password ? Redacted.value(password) : undefined,
      },
      extendEnv: true,
      shell: false,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
      killSignal: "SIGTERM",
      forceKillAfter: "10 seconds",
    },
  );
}

const captureActions = new Set([
  "read",
  "glob",
  "grep",
  "webfetch",
  "websearch",
  "external_directory",
  "notes_note_list",
  "notes_note_read",
  "notes_note_write",
]);

/** Create and independently verify a session on the existing default V2 server. */
export const createOpenCodeSession = Effect.fn("OpenCodeClient.createSession")(
  function* (
    config: DaemonConfig,
    spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  ) {
    const invoke = Effect.fn("OpenCodeClient.sessionCommand")(function* (
      args: readonly string[],
      password?: Redacted.Redacted<string>,
    ) {
      const child = yield* spawner
        .spawn(openCodeCommand(config, args, password))
        .pipe(
          Effect.mapError(
            (error) =>
              new OpenCodeSessionError({
                message: `Could not start OpenCode session setup command (${error.reason._tag})`,
              }),
          ),
        );

      let bytes = 0;

      const [exitCode, output] = yield* Effect.all(
        [
          child.exitCode,
          child.stdout.pipe(
            Stream.mapEffect((chunk) => {
              bytes += chunk.byteLength;

              return bytes <= 1024 * 1024
                ? Effect.succeed(chunk)
                : Effect.fail(
                    new OpenCodeSessionError({
                      message:
                        "OpenCode session setup output exceeded its size limit",
                    }),
                  );
            }),
            Stream.decodeText(),
            Stream.runFold(
              () => "",
              (text, chunk) => text + chunk,
            ),
          ),
        ],
        { concurrency: "unbounded" },
      );

      if (exitCode !== 0)
        return yield* new OpenCodeSessionError({
          message: `OpenCode session setup exited with code ${exitCode}`,
        });

      return output;
    }, Effect.scoped);

    const server = (yield* invoke(["service", "status"])).trim();

    if (!/^https?:\/\/\S+$/.test(server))
      return yield* new OpenCodeSessionError({
        message: "The default OpenCode V2 server is not running",
      });

    const password = Redacted.make(
      (yield* invoke(["service", "get", "password"])).trim(),
    );

    const api = (args: readonly string[]) =>
      invoke(["api", "--server", server, ...args], password);

    const directory = resolve(config.opencodeDirectory);
    const location = `?location[directory]=${encodeURIComponent(directory)}`;

    const agent = yield* Effect.gen(function* () {
      const agents = yield* Schema.decodeEffect(Schema.fromJsonString(Agents))(
        yield* api(["get", `/api/agent${location}`]),
      ).pipe(
        Effect.mapError(
          () =>
            new OpenCodeSessionError({
              message: "OpenCode returned invalid agent permissions",
            }),
        ),
      );

      if (agents.location.directory !== directory)
        return yield* new OpenCodeSessionError({
          message: "OpenCode returned agents from a different location",
        });

      return agents.data.find((entry) => entry.id === config.opencodeAgent);
    }).pipe(
      Effect.repeat({
        while: (agent) => agent === undefined,
        schedule: Schedule.spaced("1 second"),
        times: config.commandTimeoutSeconds,
      }),
    );

    if (!agent || agent.permissions.length === 0)
      return yield* new OpenCodeSessionError({
        message:
          "Cannot resolve the Notes capture agent permissions at the requested location",
      });

    const permissions: typeof Rules.Type = [
      { action: "*", resource: "*", effect: "deny" },
      // Session rules override agent rules. Replay restrictions and exceptions
      // in their original order, without granting unrelated capabilities.
      ...agent.permissions
        .filter(
          (rule) =>
            rule.effect !== "allow" ||
            captureActions.has(rule.action) ||
            rule.action.startsWith("github_") ||
            rule.action.startsWith("exa_"),
        )
        .map((rule) => ({
          ...rule,
          effect: rule.effect === "ask" ? ("deny" as const) : rule.effect,
        })),
    ];

    const created = yield* Schema.decodeEffect(Schema.fromJsonString(Session))(
      yield* api([
        "post",
        "/api/session",
        "--data",
        JSON.stringify({
          title: `Notes daemon ${config.workerId}`,
          agent: config.opencodeAgent,
          location: { directory },
          permissions,
        }),
      ]),
    ).pipe(
      Effect.mapError(
        () =>
          new OpenCodeSessionError({
            message: "OpenCode returned an invalid created session",
          }),
      ),
    );

    const stored = yield* Schema.decodeEffect(Schema.fromJsonString(Session))(
      yield* api(["get", `/api/session/${created.data.id}`]),
    ).pipe(
      Effect.mapError(
        () =>
          new OpenCodeSessionError({
            message: "OpenCode returned an invalid stored session",
          }),
      ),
    );

    if (
      stored.data.id !== created.data.id ||
      [created.data, stored.data].some(
        (session) =>
          session.agent !== config.opencodeAgent ||
          session.location.directory !== directory ||
          JSON.stringify(session.permissions) !== JSON.stringify(permissions),
      )
    )
      return yield* new OpenCodeSessionError({
        message:
          "OpenCode did not retain the requested session agent, location and permissions",
      });

    return { id: stored.data.id, server, password };
  },
);
