import { Effect, Ref, Schema } from "effect";
import {
  COMPLETION_MARKER,
  FAILURE_MARKER,
  issueHasFailure,
  issueIsComplete,
  issuePrompt,
  type QueueIssue,
} from "./schema.js";
import { IssueQueue } from "./services/IssueQueue.js";
import { OpenCodeClient } from "./services/OpenCodeClient.js";

const MAX_RESULT_LENGTH = 20_000;

/** Failure raised when daemon processing loses ownership or returns invalid output. */
export class DaemonProcessingError extends Schema.TaggedErrorClass<DaemonProcessingError>()(
  "DaemonProcessingError",
  { issueNumber: Schema.Int, message: Schema.String },
) {}

/** Result of one queue processing pass. */
export interface ProcessingPassResult {
  /** Number of queue issues observed. */
  readonly observed: number;
  /** Number of issues completed by this daemon. */
  readonly completed: number;
  /** Number skipped because another daemon owned them or state changed. */
  readonly skipped: number;
  /** Number left open after processing failed. */
  readonly failed: number;
}

const requireOwnership = Effect.fn("NotesDaemon.requireOwnership")(function* (
  issueNumber: number,
  claimLabel: string,
) {
  const queue = yield* IssueQueue;
  if (yield* queue.owns(issueNumber, claimLabel)) return;
  return yield* new DaemonProcessingError({
    issueNumber,
    message: "Issue claim ownership was lost",
  });
});

const currentQueuedIssue = Effect.fn("NotesDaemon.currentQueuedIssue")(
  function* (issueNumber: number, queueLabel: string) {
    const queue = yield* IssueQueue;
    const issue = yield* queue.get(issueNumber);
    return issue.state === "open" && issue.labels.includes(queueLabel)
      ? issue
      : null;
  },
);

const processClaimedIssue = Effect.fn("NotesDaemon.processClaimedIssue")(
  function* (
    issue: QueueIssue,
    claimLabel: string,
    queueLabel: string,
    workerActor: string,
  ) {
    const queue = yield* IssueQueue;
    const opencode = yield* OpenCodeClient;
    const current = yield* currentQueuedIssue(issue.number, queueLabel);
    if (!current) return false;

    if (issueIsComplete(current, workerActor)) {
      yield* requireOwnership(issue.number, claimLabel);
      yield* queue.complete(issue.number);
      return true;
    }

    const result = (yield* opencode.process(issuePrompt(current))).trim();
    if (!result || result.length > MAX_RESULT_LENGTH) {
      return yield* new DaemonProcessingError({
        issueNumber: issue.number,
        message: "OpenCode returned invalid result text",
      });
    }

    yield* requireOwnership(issue.number, claimLabel);
    if (!(yield* currentQueuedIssue(issue.number, queueLabel))) return false;
    yield* queue.comment(issue.number, `${COMPLETION_MARKER}\n\n${result}`);

    yield* requireOwnership(issue.number, claimLabel);
    const beforeClose = yield* currentQueuedIssue(issue.number, queueLabel);
    if (!beforeClose || !issueIsComplete(beforeClose, workerActor))
      return false;
    yield* queue.complete(issue.number);
    return true;
  },
);

const processIssue = Effect.fn("NotesDaemon.processIssue")(function* (
  issue: QueueIssue,
  queueLabel: string,
  workerActor: string,
) {
  const queue = yield* IssueQueue;
  const claimLabel = yield* queue.claim(issue.number);
  if (!claimLabel) return "skipped" as const;

  const releaseFailed = yield* Ref.make(false);
  const outcome = yield* Effect.acquireUseRelease(
    Effect.succeed(claimLabel),
    () =>
      processClaimedIssue(issue, claimLabel, queueLabel, workerActor).pipe(
        Effect.map((completed) =>
          completed ? ("completed" as const) : ("skipped" as const),
        ),
        Effect.catch((error) =>
          Effect.gen(function* () {
            console.error(
              `[notes-daemon] issue=${issue.number} processing failed`,
              error,
            );
            const [, current] = yield* Effect.all([
              requireOwnership(issue.number, claimLabel),
              currentQueuedIssue(issue.number, queueLabel),
            ]);
            if (
              current &&
              !issueIsComplete(current, workerActor) &&
              !issueHasFailure(current, workerActor)
            ) {
              yield* queue.comment(
                issue.number,
                `${FAILURE_MARKER}\n\nProcessing failed and the issue was left open.`,
              );
            }
            return "failed" as const;
          }).pipe(Effect.orElseSucceed(() => "failed" as const)),
        ),
      ),
    () =>
      queue
        .release(claimLabel)
        .pipe(
          Effect.catch((error) =>
            Ref.set(releaseFailed, true).pipe(
              Effect.tap(() =>
                Effect.sync(() =>
                  console.error(
                    `[notes-daemon] failed to release ${claimLabel} from issue ${issue.number}`,
                    error,
                  ),
                ),
              ),
            ),
          ),
        ),
  );
  if (yield* Ref.get(releaseFailed)) {
    return yield* new DaemonProcessingError({
      issueNumber: issue.number,
      message: `Failed to release issue claim ${claimLabel}`,
    });
  }
  return outcome;
});

/** Process one snapshot of the configured issue queue. */
export const runProcessingPass = Effect.fn("NotesDaemon.runProcessingPass")(
  function* (queueLabel: string, workerActor: string) {
    const queue = yield* IssueQueue;
    const issues = yield* queue.list();
    const outcomes = yield* Effect.forEach(
      issues,
      (issue) => processIssue(issue, queueLabel, workerActor),
      { concurrency: 1 },
    );

    return {
      observed: issues.length,
      completed: outcomes.filter((outcome) => outcome === "completed").length,
      skipped: outcomes.filter((outcome) => outcome === "skipped").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
    } satisfies ProcessingPassResult;
  },
);
