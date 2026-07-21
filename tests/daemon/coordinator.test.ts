import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { runProcessingPass } from "../../src/daemon/coordinator.js";
import { COMPLETION_MARKER, type QueueIssue } from "../../src/daemon/schema.js";
import { IssueQueue } from "../../src/daemon/services/IssueQueue.js";
import { OpenCodeClient } from "../../src/daemon/services/OpenCodeClient.js";
import {
  RepositoryLock,
  RepositoryLockError,
  type IssueLease,
} from "../../src/daemon/services/RepositoryLock.js";

function issue(comments: QueueIssue["comments"] = []): QueueIssue {
  return {
    number: 1,
    title: "Captured note",
    body: "Summarise this note",
    state: "open",
    labels: ["agent:ready"],
    comments: [...comments],
  };
}

describe("runProcessingPass", () => {
  test("comments, closes, and releases a claimed issue", async () => {
    let current = issue();
    const released: IssueLease[] = [];
    const lease: IssueLease = {
      issueNumber: 1,
      ref: "refs/daemon-locks/issues/1",
      oid: "abc",
      nonce: "n1",
    };
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        comment: (_number, body) =>
          Effect.sync(() => {
            current = {
              ...current,
              comments: [...current.comments, { author: "worker", body }],
            };
          }),
        complete: () =>
          Effect.sync(() => {
            current = { ...current, state: "closed", labels: [] };
          }),
      }),
      Layer.succeed(RepositoryLock, {
        acquire: (): Effect.Effect<IssueLease | null> => Effect.succeed(lease),
        owns: () => Effect.succeed(true),
        release: (value) =>
          Effect.sync(() => {
            released.push(value);
          }),
      }),
      Layer.succeed(OpenCodeClient, {
        process: () => Effect.succeed("Processed result"),
      }),
    );

    const result = await Effect.runPromise(
      runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
    );
    expect(result).toEqual({
      observed: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
    });
    expect(current.state).toBe("closed");
    expect(current.comments[0]?.body).toContain(COMPLETION_MARKER);
    expect(released).toEqual([lease]);
  });

  test("skips when another daemon owns the issue", async () => {
    const current = issue();
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        comment: () => Effect.die("comment should not run"),
        complete: () => Effect.die("complete should not run"),
      }),
      Layer.succeed(RepositoryLock, {
        acquire: () => Effect.succeed(null),
        owns: () => Effect.succeed(false),
        release: () => Effect.void,
      }),
      Layer.succeed(OpenCodeClient, {
        process: () => Effect.die("OpenCode should not run"),
      }),
    );

    const result = await Effect.runPromise(
      runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
    );
    expect(result).toEqual({
      observed: 1,
      completed: 0,
      skipped: 1,
      failed: 0,
    });
  });

  test("reconciles a trusted completion marker by closing only", async () => {
    let current = issue([
      { author: "worker", body: `${COMPLETION_MARKER}\n\nAlready done` },
    ]);
    let opencodeCalls = 0;
    const lease: IssueLease = {
      issueNumber: 1,
      ref: "refs/daemon-locks/issues/1",
      oid: "abc",
      nonce: "n1",
    };
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        comment: () => Effect.die("comment should not run"),
        complete: () =>
          Effect.sync(() => {
            current = { ...current, state: "closed", labels: [] };
          }),
      }),
      Layer.succeed(RepositoryLock, {
        acquire: (): Effect.Effect<IssueLease | null> => Effect.succeed(lease),
        owns: () => Effect.succeed(true),
        release: () => Effect.void,
      }),
      Layer.succeed(OpenCodeClient, {
        process: () =>
          Effect.sync(() => {
            opencodeCalls += 1;
            return "unexpected";
          }),
      }),
    );

    const result = await Effect.runPromise(
      runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
    );
    expect(result.completed).toBe(1);
    expect(current.state).toBe("closed");
    expect(opencodeCalls).toBe(0);
  });

  test("does not close an issue dequeued after the result comment", async () => {
    let current = issue();
    let closeCalls = 0;
    const lease: IssueLease = {
      issueNumber: 1,
      ref: "refs/daemon-locks/issues/1",
      oid: "abc",
      nonce: "n1",
    };
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        comment: (_number, body) =>
          Effect.sync(() => {
            current = {
              ...current,
              labels: [],
              comments: [...current.comments, { author: "worker", body }],
            };
          }),
        complete: () =>
          Effect.sync(() => {
            closeCalls += 1;
          }),
      }),
      Layer.succeed(RepositoryLock, {
        acquire: (): Effect.Effect<IssueLease | null> => Effect.succeed(lease),
        owns: () => Effect.succeed(true),
        release: () => Effect.void,
      }),
      Layer.succeed(OpenCodeClient, {
        process: () => Effect.succeed("Processed result"),
      }),
    );

    const result = await Effect.runPromise(
      runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
    );
    expect(result.skipped).toBe(1);
    expect(closeCalls).toBe(0);
  });

  test("escalates release failure to pass supervision", async () => {
    const issues = [issue(), { ...issue(), number: 2 }];
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed(issues),
        get: (number) => Effect.succeed(issues[number - 1]!),
        comment: (number, body) =>
          Effect.sync(() => {
            const current = issues[number - 1]!;
            issues[number - 1] = {
              ...current,
              comments: [...current.comments, { author: "worker", body }],
            };
          }),
        complete: () => Effect.void,
      }),
      Layer.succeed(RepositoryLock, {
        acquire: (number): Effect.Effect<IssueLease | null> =>
          Effect.succeed({
            issueNumber: number,
            ref: `refs/daemon-locks/issues/${number}`,
            oid: String(number),
            nonce: String(number),
          }),
        owns: () => Effect.succeed(true),
        release: (lease) =>
          lease.issueNumber === 1
            ? Effect.fail(
                new RepositoryLockError({
                  operation: "release",
                  message: "failed",
                }),
              )
            : Effect.void,
      }),
      Layer.succeed(OpenCodeClient, {
        process: () => Effect.succeed("Processed result"),
      }),
    );

    const result = await Effect.runPromise(
      Effect.exit(
        runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
      ),
    );
    expect(result._tag).toBe("Failure");
  });
});
