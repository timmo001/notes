import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { runProcessingPass } from "../../src/daemon/coordinator.js";
import {
  COMPLETION_MARKER,
  FAILURE_MARKER,
  type QueueIssue,
} from "../../src/daemon/schema.js";
import {
  IssueQueue,
  IssueQueueError,
} from "../../src/daemon/services/IssueQueue.js";
import {
  OpenCodeClient,
  OpenCodeClientError,
} from "../../src/daemon/services/OpenCodeClient.js";

const claimLabel = "agent:processing:desktop:12345678";

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
    const released: string[] = [];
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        claim: () => Effect.succeed(claimLabel),
        owns: () => Effect.succeed(true),
        release: (label) =>
          Effect.sync(() => {
            released.push(label);
          }),
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
    expect(released).toEqual([claimLabel]);
  });

  test("skips when another daemon owns the issue", async () => {
    const current = issue();
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        claim: () => Effect.succeed(null),
        owns: () => Effect.succeed(false),
        release: () => Effect.void,
        comment: () => Effect.die("comment should not run"),
        complete: () => Effect.die("complete should not run"),
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
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        claim: () => Effect.succeed(claimLabel),
        owns: () => Effect.succeed(true),
        release: () => Effect.void,
        comment: () => Effect.die("comment should not run"),
        complete: () =>
          Effect.sync(() => {
            current = { ...current, state: "closed", labels: [] };
          }),
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
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        claim: () => Effect.succeed(claimLabel),
        owns: () => Effect.succeed(true),
        release: () => Effect.void,
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
        claim: () => Effect.succeed(claimLabel),
        owns: () => Effect.succeed(true),
        release: () =>
          Effect.fail(
            new IssueQueueError({
              operation: "release",
              message: "failed",
            }),
          ),
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

  test("logs a processing error and writes one trusted failure marker", async () => {
    let current = issue();
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    const layer = Layer.mergeAll(
      Layer.succeed(IssueQueue, {
        list: () => Effect.succeed([current]),
        get: () => Effect.succeed(current),
        claim: () => Effect.succeed(claimLabel),
        owns: () => Effect.succeed(true),
        release: () => Effect.void,
        comment: (_number, body) =>
          Effect.sync(() => {
            current = {
              ...current,
              comments: [...current.comments, { author: "worker", body }],
            };
          }),
        complete: () => Effect.die("complete should not run"),
      }),
      Layer.succeed(OpenCodeClient, {
        process: () =>
          Effect.fail(
            new OpenCodeClientError({
              operation: "process.models",
              message: "provider unavailable",
            }),
          ),
      }),
    );

    try {
      const first = await Effect.runPromise(
        runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
      );
      const second = await Effect.runPromise(
        runProcessingPass("agent:ready", "worker").pipe(Effect.provide(layer)),
      );

      expect(first.failed).toBe(1);
      expect(second.failed).toBe(1);
      expect(
        current.comments.filter(({ body }) => body.includes(FAILURE_MARKER)),
      ).toHaveLength(1);
      expect(errors).toHaveLength(2);
      expect(errors[0]?.[0]).toContain("issue=1 processing failed");
    } finally {
      console.error = originalError;
    }
  });
});
