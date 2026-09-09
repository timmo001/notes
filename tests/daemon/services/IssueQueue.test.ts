import { describe, expect, test } from "bun:test";
import { layer as ghLayer } from "@timmo001/effect-gh";
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  PlatformError,
  Sink,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { DaemonConfig } from "../../../src/daemon/schema.js";
import {
  IssueQueue,
  IssueQueueError,
} from "../../../src/daemon/services/IssueQueue.js";

const config = DaemonConfig.make({
  repository: "owner/repo",
  queueLabel: "agent:ready",
  workerId: "desktop",
  workerActor: "worker",
  opencodeUrl: "http://127.0.0.1:4096",
  opencodeDirectory: "/workspace",
  opencodeAgent: "notes-daemon",
  opencodeModels: [{ providerID: "opencode", modelID: "test" }],
  allowedReadPaths: ["/workspace"],
  sessionTimeoutSeconds: 30,
  passTimeoutSeconds: 60,
  commandTimeoutSeconds: 5,
  consecutiveFailureLimit: 3,
  pollIntervalSeconds: 30,
});
const issue = {
  number: 42,
  title: "Captured note",
  body: "",
  state: "OPEN",
  labels: [{ name: "agent:ready" }],
  comments: [{ author: { login: "worker" }, body: "Saved note" }],
};
const fields = "number,title,body,state,labels,comments";
const text = (value: string) => Stream.succeed(new TextEncoder().encode(value));

const fixture = Effect.fn("test.issueQueueFixture")(function* (
  respond: (
    args: readonly string[],
  ) => Partial<ChildProcessSpawner.ChildProcessHandle>,
) {
  const commands: ChildProcess.StandardCommand[] = [];
  const spawned = yield* Deferred.make<void>();
  let releases = 0;
  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (command._tag !== "StandardCommand")
            throw new Error("Expected a standard command");
          commands.push(command);
          return ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(1),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            stdin: Sink.drain,
            stdout: Stream.empty,
            stderr: Stream.empty,
            all: Stream.empty,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            unref: Effect.succeed(Effect.void),
            ...respond(command.args),
          });
        }).pipe(Effect.tap(() => Deferred.succeed(spawned, undefined))),
        () => Effect.sync(() => releases++),
      ),
    ),
  );
  const queue = yield* IssueQueue.pipe(
    Effect.provide(
      IssueQueue.layer(config).pipe(
        Layer.provide(ghLayer().pipe(Layer.provide(spawner))),
      ),
    ),
  );
  return { queue, commands, spawned, releases: () => releases };
});

describe("IssueQueue SDK boundary", () => {
  test("retains list fields, bounds, empty bodies and comment authors", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture((args) => ({
          stdout: text(JSON.stringify(args[1] === "list" ? [issue] : issue)),
        }));
        const issues = yield* fake.queue.list();
        expect(issues).toEqual([
          {
            ...issue,
            state: "open",
            labels: ["agent:ready"],
            comments: [{ author: "worker", body: "Saved note" }],
          },
        ]);
        expect(yield* fake.queue.get(42)).toEqual(issues[0]);
        expect(fake.commands.map((command) => command.args)).toEqual([
          [
            "issue",
            "list",
            "--repo",
            "owner/repo",
            "--state",
            "open",
            "--label",
            "agent:ready",
            "--limit",
            "100",
            "--json",
            fields,
          ],
          ["issue", "view", "42", "--repo", "owner/repo", "--json", fields],
        ]);
        for (const command of fake.commands) {
          expect(command.command).toBe("gh");
          expect(command.options).toMatchObject({
            cwd: undefined,
            extendEnv: true,
            shell: false,
            stdin: "ignore",
            env: { GH_PROMPT_DISABLED: "1", GH_PAGER: "cat" },
          });
          expect(command.options.env).not.toHaveProperty("GH_TOKEN");
        }
        expect(fake.releases()).toBe(2);
      }),
    );
  });

  test("accepts empty lists and normalises closed issues with no comments", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture((args) => ({
          stdout: text(
            JSON.stringify(
              args[1] === "list"
                ? []
                : { ...issue, state: "CLOSED", comments: [] },
            ),
          ),
        }));
        expect(yield* fake.queue.list()).toEqual([]);
        expect(yield* fake.queue.get(42)).toMatchObject({
          state: "closed",
          comments: [],
        });
      }),
    );
  });

  test.each(["list", "get"] as const)(
    "%s preserves JSON and schema error operations",
    async (operation) => {
      for (const [stdout, suffix] of [
        ["not JSON", ""],
        ["", ""],
        ["null", ".decode"],
        [
          JSON.stringify(
            operation === "list"
              ? [{ ...issue, body: null }]
              : { ...issue, body: null },
          ),
          ".decode",
        ],
      ]) {
        await Effect.runPromise(
          Effect.gen(function* () {
            const fake = yield* fixture(() => ({ stdout: text(stdout) }));
            const error = yield* (
              operation === "list"
                ? fake.queue.list().pipe(Effect.asVoid)
                : fake.queue.get(42).pipe(Effect.asVoid)
            ).pipe(Effect.flip);
            expect(error).toBeInstanceOf(IssueQueueError);
            expect(error.operation).toBe(operation + suffix);
            expect(error.message.length).toBeGreaterThan(0);
            expect(fake.commands).toHaveLength(1);
          }),
        );
      }
    },
  );

  test.each([false, true])(
    "checks claim ownership and cleans up a competing claim: %s",
    async (competing) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          let label = "";
          const otherLabel = "agent:processing:other:12345678";
          const fake = yield* fixture((args) => {
            if (args[0] === "label" && args[1] === "create") label = args[2];
            return args[1] === "view"
              ? {
                  stdout: text(
                    JSON.stringify({
                      ...issue,
                      labels: [
                        ...issue.labels,
                        ...(label
                          ? [
                              { name: label },
                              ...(competing ? [{ name: otherLabel }] : []),
                            ]
                          : []),
                      ],
                    }),
                  ),
                }
              : {};
          });
          const claimed = yield* fake.queue.claim(42);
          expect(label).toMatch(/^agent:processing:desktop:[a-f0-9]{8}$/);
          expect(claimed).toBe(competing ? null : label);
          expect(fake.commands.map((command) => command.args)).toEqual([
            ["issue", "view", "42", "--repo", "owner/repo", "--json", fields],
            [
              "label",
              "create",
              label,
              "--repo",
              "owner/repo",
              "--color",
              "D9AF59",
              "--description",
              "Claimed by notes daemon worker desktop",
              "--force",
            ],
            [
              "issue",
              "edit",
              "42",
              "--repo",
              "owner/repo",
              "--add-label",
              label,
            ],
            ["issue", "view", "42", "--repo", "owner/repo", "--json", fields],
            ...(competing
              ? [["label", "delete", label, "--repo", "owner/repo", "--yes"]]
              : []),
          ]);
          expect(yield* fake.queue.owns(42, label)).toBe(!competing);
          expect(yield* fake.queue.owns(42, otherLabel)).toBe(false);
        }),
      );
    },
  );

  test("does not mutate an issue already claimed by another worker", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({
          stdout: text(
            JSON.stringify({
              ...issue,
              labels: [{ name: "agent:processing:other:12345678" }],
            }),
          ),
        }));
        expect(yield* fake.queue.claim(42)).toBeNull();
        expect(fake.commands).toHaveLength(1);
      }),
    );
  });

  test("passes comment text literally, accepts empty mutation output and closes before removing the label", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({}));
        const body = "Saved 'note'\n$(no-shell); 世界";
        yield* fake.queue.comment(42, body);
        yield* fake.queue.complete(42);
        yield* fake.queue.release("agent:processing:desktop:12345678");
        expect(fake.commands.map((command) => command.args)).toEqual([
          ["issue", "comment", "42", "--repo", "owner/repo", "--body", body],
          ["issue", "close", "42", "--repo", "owner/repo"],
          [
            "issue",
            "edit",
            "42",
            "--repo",
            "owner/repo",
            "--remove-label",
            "agent:ready",
          ],
          [
            "label",
            "delete",
            "agent:processing:desktop:12345678",
            "--repo",
            "owner/repo",
            "--yes",
          ],
        ]);
      }),
    );
  });

  test.each(["create", "edit"])(
    "does not retry or continue a failed claim %s",
    async (step) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fake = yield* fixture((args) => ({
            stdout: text(JSON.stringify(issue)),
            exitCode: Effect.succeed(
              ChildProcessSpawner.ExitCode(args[1] === step ? 1 : 0),
            ),
          }));
          const error = yield* fake.queue.claim(42).pipe(Effect.flip);
          expect(error).toBeInstanceOf(IssueQueueError);
          expect(error.operation).toBe("claim");
          expect(fake.commands.map((command) => command.args[1])).toEqual(
            step === "create" ? ["view", "create"] : ["view", "create", "edit"],
          );
        }),
      );
    },
  );

  test.each(["close", "edit"])(
    "does not retry or continue a failed completion %s",
    async (step) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fake = yield* fixture((args) => ({
            stdout: text("possibly applied"),
            stderr: text("e".repeat(70_000)),
            exitCode: Effect.succeed(
              ChildProcessSpawner.ExitCode(args[1] === step ? 7 : 0),
            ),
          }));
          const error = yield* fake.queue.complete(42).pipe(Effect.flip);
          expect(error).toBeInstanceOf(IssueQueueError);
          expect(error.operation).toBe("complete");
          // The queue exposes an operation and message, never subprocess output.
          expect(error.message).toBe("GhCommandError");
          expect(fake.commands.map((command) => command.args[1])).toEqual(
            step === "close" ? ["close"] : ["close", "edit"],
          );
        }),
      );
    },
  );

  test.each(["list", "comment", "release"] as const)(
    "maps %s transport failures without retries",
    async (operation) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fake = yield* fixture(() => ({
            stdout: Stream.fail(
              PlatformError.systemError({
                module: "ChildProcess",
                method: "read",
                _tag: "Unknown",
              }),
            ),
          }));
          const error = yield* (
            operation === "list"
              ? fake.queue.list()
              : operation === "comment"
                ? fake.queue.comment(42, "saved")
                : fake.queue.release("claim")
          ).pipe(Effect.flip);
          expect(error).toBeInstanceOf(IssueQueueError);
          expect(error.operation).toBe(operation);
          expect(error.message).toBe("GhPlatformError");
          expect(fake.commands).toHaveLength(1);
          expect(fake.releases()).toBe(1);
        }),
      );
    },
  );

  test.each(["get", "comment", "complete"] as const)(
    "%s times out and releases the child without retrying",
    async (operation) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fake = yield* fixture(() => ({
            stdout: Stream.never,
            exitCode: Effect.never,
          }));
          const fiber = yield* (
            operation === "get"
              ? fake.queue.get(42)
              : operation === "comment"
                ? fake.queue.comment(42, "saved")
                : fake.queue.complete(42)
          ).pipe(Effect.flip, Effect.forkChild);
          yield* Deferred.await(fake.spawned);
          yield* TestClock.adjust("5 seconds");
          const error = yield* Fiber.join(fiber);
          expect(error).toBeInstanceOf(IssueQueueError);
          expect(error.operation).toBe(operation);
          expect(error.message).toBe("GhTimeoutError");
          expect(fake.commands).toHaveLength(1);
          expect(fake.releases()).toBe(1);
        }).pipe(Effect.provide(TestClock.layer())),
      );
    },
  );

  test("interruption releases the child and skips subsequent mutations", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const fake = yield* fixture(() => ({
          stdout: Stream.never,
          exitCode: Effect.never,
        }));
        const fiber = yield* fake.queue.complete(42).pipe(Effect.forkChild);
        yield* Deferred.await(fake.spawned);
        yield* Fiber.interrupt(fiber);
        expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
        expect(fake.commands).toHaveLength(1);
        expect(fake.releases()).toBe(1);
      }),
    );
  });
});
