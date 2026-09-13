import { describe, expect, test } from "bun:test";
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Schema,
  Sink,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { OpenCodeClient } from "../../../src/daemon/services/OpenCodeClient.js";
import { DaemonConfig } from "../../../src/daemon/schema.js";

const config = DaemonConfig.make({
  repository: "owner/repo",
  queueLabel: "agent:ready",
  workerId: "desktop",
  workerActor: "worker",
  opencodeDirectory: "/workspace",
  opencodeAgent: "notes-daemon",
  opencodeModels: [
    { providerID: "provider", modelID: "primary" },
    { providerID: "other", modelID: "fallback", variant: "low" },
  ],
  allowedReadPaths: ["/workspace"],
  sessionTimeoutSeconds: 30,
  passTimeoutSeconds: 60,
  commandTimeoutSeconds: 5,
  consecutiveFailureLimit: 3,
  pollIntervalSeconds: 30,
});

const textEvent = (text: string, messageID = "msg_2") =>
  JSON.stringify({ type: "text", part: { messageID, text } }) + "\n";

const output = (value: string) =>
  Stream.succeed(new TextEncoder().encode(value));

const fixture = Effect.fn("test.openCodeFixture")(function* (
  respond: (attempt: number) => Partial<ChildProcessSpawner.ChildProcessHandle>,
  overrides: Partial<DaemonConfig> = {},
) {
  const commands: ChildProcess.StandardCommand[] = [];
  const spawned = yield* Deferred.make<void>();
  let releases = 0;
  let attempts = 0;
  let session = "";

  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!ChildProcess.isStandardCommand(command))
            throw new Error("Expected a standard command");
          commands.push(command);

          const args = command.args.slice(overrides.opencodeArgs?.length ?? 0);
          const isRun = args[0] === "run";
          let response: Partial<ChildProcessSpawner.ChildProcessHandle> = {};

          if (isRun) {
            response = respond(++attempts);
          } else if (args[0] === "service") {
            response = {
              stdout: output(
                args[1] === "status"
                  ? "http://127.0.0.1:49374\n"
                  : "test-password\n",
              ),
            };
          } else if (args[4]?.startsWith("/api/plugin/await-activation?")) {
            response = { stdout: Stream.empty };
          } else if (args[4]?.startsWith("/api/agent/")) {
            response = {
              stdout: output(
                JSON.stringify({
                  location: { directory: config.opencodeDirectory },
                  data: {
                    id: "notes-daemon",
                    permissions: [
                      { action: "*", resource: "*", effect: "deny" },
                      { action: "read", resource: "*", effect: "allow" },
                      {
                        action: "notes_note_write",
                        resource: "*",
                        effect: "allow",
                      },
                    ],
                  },
                }),
              ),
            };
          } else {
            if (args[3] === "post") {
              const data = Schema.decodeSync(
                Schema.fromJsonString(
                  Schema.Struct({
                    agent: Schema.String,
                    location: Schema.Struct({ directory: Schema.String }),
                    permissions: Schema.Unknown,
                  }),
                ),
              )(args[6] ?? "");

              session = JSON.stringify({
                data: { ...data, id: `ses_attempt${attempts + 1}` },
              });
            }

            response = { stdout: output(session) };
          }

          return {
            isRun,
            handle: ChildProcessSpawner.makeHandle({
              pid: ChildProcessSpawner.ProcessId(1),
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
              isRunning: Effect.succeed(false),
              kill: () => Effect.void,
              stdin: Sink.drain,
              stdout: output(textEvent("STATUS: success\nSaved note abc123")),
              stderr: Stream.empty,
              all: Stream.empty,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
              unref: Effect.succeed(Effect.void),
              ...response,
            }),
          };
        }).pipe(
          Effect.tap(({ isRun }) =>
            isRun ? Deferred.succeed(spawned, undefined) : Effect.void,
          ),
          Effect.map(({ handle }) => handle),
        ),
        () => Effect.sync(() => releases++),
      ),
    ),
  );

  const client = yield* OpenCodeClient.pipe(
    Effect.provide(
      OpenCodeClient.layer({ ...config, ...overrides }).pipe(
        Layer.provide(spawner),
      ),
    ),
  );

  return { client, commands, spawned, releases: () => releases };
});

describe("OpenCodeClient command boundary", () => {
  test("preserves prefix argv and prompt, uses cwd and keeps stderr separate", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(
          () => ({
            stderr: output("not JSON"),
            all: output("must not be read"),
          }),
          {
            opencodeCommand: "/opt/processor",
            opencodeArgs: ["--limit", "two words", "--"],
          },
        );

        expect(
          yield* fake.client.process("--prompt 'quoted'\n$(literal)"),
        ).toBe("Saved note abc123");
        expect(fake.commands[0]?.command).toBe("/opt/processor");
        expect(fake.commands[6]?.args).toEqual([
          "--limit",
          "two words",
          "--",
          "run",
          "--server",
          "http://127.0.0.1:49374",
          "--session",
          "ses_attempt1",
          "--format",
          "json",
          "--agent",
          "notes-daemon",
          "--model",
          "provider/primary",
          "--title",
          "Notes daemon desktop",
          "--",
          "--prompt 'quoted'\n$(literal)",
        ]);
        expect(fake.commands[0]?.options).toMatchObject({
          cwd: "/workspace",
          env: { PWD: "/workspace" },
          extendEnv: true,
          shell: false,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "inherit",
          killSignal: "SIGTERM",
          forceKillAfter: "10 seconds",
        });
        expect(fake.commands).toHaveLength(7);
        expect(fake.releases()).toBe(7);
      }),
    );
  });

  test("decodes chunked UTF-8 JSON and only returns the final message including reconciled suffixes", async () => {
    const encoded = new TextEncoder().encode(
      textEvent("intermediate", "msg_1") +
        '{"type":"step_start","part":{"messageID":"msg_2"}}\n' +
        textEvent("STATUS: success\nSaved café ") +
        '{"type":"tool_use","part":{"text":"ignored"}}\n' +
        textEvent("abc123") +
        textEvent("older reconciliation", "msg_1"),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({
          stdout: Stream.fromIterable(
            Array.from(encoded, (byte) => Uint8Array.of(byte)),
          ),
        }));

        expect(yield* fake.client.process("prompt")).toBe("Saved café abc123");
        expect(fake.commands[0]?.command).toBe("opencode2");
      }),
    );
  });

  test.each([
    ["reported failure", textEvent("STATUS: failure\nNo note written"), 0],
    ["missing status", textEvent("Saved maybe"), 0],
    ["empty summary", textEvent("STATUS: success"), 0],
    ["malformed JSON", "not JSON\n", 0],
    ["invalid text event", '{"type":"text","part":{}}\n', 0],
    ["empty output", "", 0],
    [
      "error event",
      '{"type":"error","error":{"message":"provider unavailable"}}\n',
      0,
    ],
    ["nonzero exit", textEvent("STATUS: success\nSaved"), 1],
  ] as const)(
    "releases a %s attempt before using the fallback model",
    async (_name, stdout, code) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fake = yield* fixture((attempt) =>
            attempt === 1
              ? {
                  stdout: output(stdout),
                  exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
                }
              : {},
          );

          expect(yield* fake.client.process("prompt")).toBe(
            "Saved note abc123",
          );
          expect(fake.commands[13]?.args).toContain("other/fallback#low");
          expect(fake.releases()).toBe(14);
        }),
      );
    },
  );

  test("reports all model failures and bounds output", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({
          stdout: output(textEvent("x".repeat(20_001))),
        }));

        const error = yield* fake.client.process("prompt").pipe(Effect.flip);
        expect(error.operation).toBe("process.models");
        expect(error.message).toContain("provider/primary, other/fallback#low");
        expect(error.message).toContain("size limit");
        expect(fake.releases()).toBe(14);
      }),
    );
  });

  test("times out a session, releases its child and tries the fallback", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture((attempt) =>
          attempt === 1 ? { stdout: Stream.never, exitCode: Effect.never } : {},
        );

        const fiber = yield* fake.client
          .process("prompt")
          .pipe(Effect.forkChild);

        yield* Deferred.await(fake.spawned);
        yield* TestClock.adjust("30 seconds");
        expect(yield* Fiber.join(fiber)).toBe("Saved note abc123");
        expect(fake.commands).toHaveLength(14);
        expect(fake.releases()).toBe(14);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  test("cancellation releases the child without starting a fallback", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({
          stdout: Stream.never,
          exitCode: Effect.never,
        }));

        const fiber = yield* fake.client
          .process("prompt")
          .pipe(Effect.forkChild);

        yield* Deferred.await(fake.spawned);
        yield* Fiber.interrupt(fiber);
        expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
        expect(fake.commands).toHaveLength(7);
        expect(fake.releases()).toBe(7);
      }),
    );
  });

  test("readiness checks the executable without spawning it", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const available = yield* fixture(() => ({}), {
          opencodeCommand: process.execPath,
        });

        yield* available.client.status;
        expect(available.commands).toHaveLength(0);

        const missing = yield* fixture(() => ({}), {
          opencodeCommand: "/nonexistent/notes-processor",
        });

        expect((yield* missing.client.status.pipe(Effect.flip)).operation).toBe(
          "command.status",
        );
        expect(missing.commands).toHaveLength(0);
      }),
    );
  });
});
