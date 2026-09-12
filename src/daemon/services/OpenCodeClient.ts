import { Context, Effect, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { resolve } from "node:path";
import type { DaemonConfig, OpenCodeModel } from "../schema.js";

const STATUS_PREFIX = /^STATUS: (success|failure)(?=\s|$)/;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_RESULT_LENGTH = 20_000;

/** Failure returned by the local OpenCode command boundary. */
export class OpenCodeClientError extends Schema.TaggedError<OpenCodeClientError>()(
  "OpenCodeClientError",
  { operation: Schema.String, message: Schema.String },
) {}

/** Local OpenCode operations required by the daemon and direct captures. */
export interface OpenCodeClientService {
  /** Check executable availability without starting OpenCode. */
  readonly status: Effect.Effect<void, OpenCodeClientError>;
  /** Run a fresh standalone session and return bounded final text. */
  readonly process: (
    prompt: string,
  ) => Effect.Effect<string, OpenCodeClientError>;
}

/** Effect service for {@link OpenCodeClientService}. */
export class OpenCodeClient extends Context.Service<
  OpenCodeClient,
  OpenCodeClientService
>()("OpenCodeClient") {
  /** Build a scoped OpenCode CLI processor layer. */
  static layer(config: DaemonConfig) {
    return Layer.effect(
      OpenCodeClient,
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const command = config.opencodeCommand ?? "opencode2";
        return OpenCodeClient.of({
          status: Effect.try({
            try: () => {
              if (!Bun.which(command, { cwd: config.opencodeDirectory })) {
                throw new Error(
                  "Configured OpenCode executable is unavailable",
                );
              }
            },
            catch: () =>
              new OpenCodeClientError({
                operation: "command.status",
                message: "Configured OpenCode executable is unavailable",
              }),
          }),
          process: (prompt) => processWithFallback(config, spawner, prompt),
        });
      }),
    );
  }
}

const processWithFallback = Effect.fn("OpenCodeClient.processWithFallback")(
  function* (
    config: DaemonConfig,
    spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
    prompt: string,
  ) {
    let lastError: OpenCodeClientError | undefined;
    for (const [index, model] of config.opencodeModels.entries()) {
      const result = yield* processWithModel(
        config,
        spawner,
        prompt,
        model,
      ).pipe(Effect.result);
      if (result._tag === "Success") {
        const response = result.success.trim();
        const status = STATUS_PREFIX.exec(response);
        const summary = status
          ? response
              .slice(status[0].length)
              .trim()
              .replace(/^(?:-|:|\u2014)\s*/, "")
          : "";
        if (status?.[1] === "success" && summary) return summary;
        lastError = new OpenCodeClientError({
          operation: "message.status",
          message:
            status?.[1] === "failure"
              ? summary || "Agent reported failure"
              : "Agent returned a result without a valid status line",
        });
      } else {
        lastError = result.failure;
      }
      if (index < config.opencodeModels.length - 1) {
        console.warn(
          `[notes-daemon] model failed model=${modelName(model)} operation=${lastError.operation} message=${lastError.message}; trying fallback`,
        );
      }
    }
    return yield* new OpenCodeClientError({
      operation: "process.models",
      message: `All models failed (${config.opencodeModels.map(modelName).join(", ")}): ${lastError?.message ?? "unknown error"}`,
    });
  },
);

const processWithModel = Effect.fn("OpenCodeClient.processWithModel")(
  function* (
    config: DaemonConfig,
    spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
    prompt: string,
    model: OpenCodeModel,
  ) {
    const child = yield* spawner.spawn(
      ChildProcess.make(
        config.opencodeCommand ?? "opencode2",
        [
          ...(config.opencodeArgs ?? []),
          "run",
          "--standalone",
          "--format",
          "json",
          "--agent",
          config.opencodeAgent,
          "--model",
          modelName(model),
          "--title",
          `Notes daemon ${config.workerId}`,
          "--",
          prompt,
        ],
        {
          cwd: config.opencodeDirectory,
          env: { PWD: resolve(config.opencodeDirectory) },
          extendEnv: true,
          shell: false,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "inherit",
          killSignal: "SIGTERM",
          forceKillAfter: "10 seconds",
        },
      ),
    );
    let bytes = 0;
    let messageId = "";
    let text = "";
    const output = child.stdout.pipe(
      Stream.mapEffect((chunk) => {
        bytes += chunk.byteLength;
        return bytes <= MAX_OUTPUT_BYTES
          ? Effect.succeed(chunk)
          : Effect.fail(
              new OpenCodeClientError({
                operation: "command.output",
                message: "OpenCode output exceeded its size limit",
              }),
            );
      }),
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filter((line) => line.trim().length > 0),
      Stream.runForEach(
        Effect.fn("OpenCodeClient.decodeEvent")(function* (line) {
          const event = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(
              Schema.Struct({
                type: Schema.String,
                part: Schema.optionalKey(Schema.Unknown),
                error: Schema.optionalKey(Schema.Unknown),
              }),
            ),
          )(line).pipe(
            Effect.mapError(
              () =>
                new OpenCodeClientError({
                  operation: "command.decode",
                  message: "OpenCode returned invalid JSON events",
                }),
            ),
          );
          if (event.type === "error") {
            const error = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ message: Schema.String }),
            )(event.error).pipe(
              Effect.mapError(
                () =>
                  new OpenCodeClientError({
                    operation: "command.decode",
                    message: "OpenCode returned an invalid error event",
                  }),
              ),
            );
            return yield* new OpenCodeClientError({
              operation: "command.run",
              message: error.message.slice(0, 500),
            });
          }
          if (event.type !== "text" && event.type !== "step_start") return;
          const part = yield* Schema.decodeUnknownEffect(
            Schema.Struct({
              messageID: Schema.NonEmptyString,
              text: Schema.optionalKey(Schema.String),
            }),
          )(event.part).pipe(
            Effect.mapError(
              () =>
                new OpenCodeClientError({
                  operation: "command.decode",
                  message: "OpenCode returned an invalid assistant event",
                }),
            ),
          );
          // OpenCode message IDs are ascending. Reconciliation may emit older text later.
          if (part.messageID < messageId) return;
          if (part.messageID !== messageId) {
            messageId = part.messageID;
            text = "";
          }
          if (event.type === "text") {
            if (part.text === undefined)
              return yield* new OpenCodeClientError({
                operation: "command.decode",
                message: "OpenCode text event has no text",
              });
            text += part.text;
            if (text.length > MAX_RESULT_LENGTH)
              return yield* new OpenCodeClientError({
                operation: "command.output",
                message: "OpenCode result exceeded its size limit",
              });
          }
        }),
      ),
    );
    const [exitCode] = yield* Effect.all([child.exitCode, output], {
      concurrency: "unbounded",
    });
    if (exitCode !== 0)
      return yield* new OpenCodeClientError({
        operation: "command.exit",
        message: `OpenCode exited with code ${exitCode}`,
      });
    if (!text.trim())
      return yield* new OpenCodeClientError({
        operation: "message.decode",
        message: "OpenCode returned no assistant text",
      });
    return text;
  },
  (effect, config) =>
    effect.pipe(
      Effect.scoped,
      Effect.timeout(`${config.sessionTimeoutSeconds} seconds`),
      Effect.mapError((error) =>
        error instanceof OpenCodeClientError
          ? error
          : new OpenCodeClientError({
              operation: "command.run",
              message:
                error._tag === "TimeoutError"
                  ? "OpenCode session timed out"
                  : "OpenCode command could not complete",
            }),
      ),
    ),
);

function modelName(model: OpenCodeModel) {
  return `${model.providerID}/${model.modelID}${model.variant ? `#${model.variant}` : ""}`;
}
