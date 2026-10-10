import { Context, Effect, Layer, Schema } from "effect";
import { Gh, GhDecodeError, Issue, Label } from "@timmo001/effect-gh";
import { QueueIssue, type DaemonConfig } from "../schema.js";

/** Failure returned by the GitHub issue queue boundary. */
export class IssueQueueError extends Schema.TaggedError<IssueQueueError>()(
  "IssueQueueError",
  { operation: Schema.String, message: Schema.String },
) {}

/** GitHub issue queue operations required by the daemon coordinator. */
export interface IssueQueueService {
  /** List open issues carrying the configured queue label. */
  readonly list: Effect.Effect<readonly QueueIssue[], IssueQueueError>;
  /** Re-read one issue before a side effect. */
  readonly get: (number: number) => Effect.Effect<QueueIssue, IssueQueueError>;
  /** Claim an issue with this worker process's visible processing label. */
  readonly claim: (
    number: number,
  ) => Effect.Effect<string | null, IssueQueueError>;
  /** Confirm that this worker process remains the sole visible claimant. */
  readonly owns: (
    number: number,
    claimLabel: string,
  ) => Effect.Effect<boolean, IssueQueueError>;
  /** Delete this worker process's processing label. */
  readonly release: (
    claimLabel: string,
  ) => Effect.Effect<void, IssueQueueError>;
  /** Add a durable daemon result comment. */
  readonly comment: (
    number: number,
    body: string,
  ) => Effect.Effect<void, IssueQueueError>;
  /** Remove queue state and close an issue. */
  readonly complete: (number: number) => Effect.Effect<void, IssueQueueError>;
}

/** Effect service for {@link IssueQueueService}. */
export class IssueQueue extends Context.Service<
  IssueQueue,
  IssueQueueService
>()("IssueQueue") {
  /** Build the GitHub CLI issue queue layer. */
  static layer(config: DaemonConfig) {
    return Layer.effect(
      IssueQueue,
      Effect.gen(function* () {
        const gh = yield* Gh;

        const options = {
          timeout: `${config.commandTimeoutSeconds} seconds` as const,
        };

        const repo = config.repository;

        const run = <A, E>(
          operation: string,
          effect: Effect.Effect<A, E, Gh>,
        ): Effect.Effect<A, IssueQueueError> =>
          effect.pipe(
            Effect.provideService(Gh, gh),
            Effect.mapError(
              (error) =>
                new IssueQueueError({
                  operation,
                  message:
                    error instanceof GhDecodeError
                      ? String(error.cause)
                      : String(error),
                }),
            ),
          );

        const get = Effect.fn("IssueQueue.get")(function* (number: number) {
          return mapIssue(
            yield* run(
              "get",
              Issue.get(number, { repo, fields: issueFields }, options),
            ),
          );
        });

        const claimLabel = `agent:processing:${config.workerId}:${crypto.randomUUID().slice(0, 8)}`;

        const processingLabels = (issue: QueueIssue) =>
          issue.labels.filter((label) => label.startsWith("agent:processing:"));

        return IssueQueue.of({
          list: run(
            "list",
            Issue.query(
              {
                repo,
                state: "open",
                labels: [config.queueLabel],
                limit: 100,
                fields: issueFields,
              },
              options,
            ),
          ).pipe(Effect.map((issues) => issues.map(mapIssue))),
          get,
          claim: (number) =>
            Effect.gen(function* () {
              if (processingLabels(yield* get(number)).length > 0) return null;
              yield* run(
                "claim",
                Label.create(
                  {
                    repo,
                    name: claimLabel,
                    color: "D9AF59",
                    description: `Claimed by notes daemon worker ${config.workerId}`,
                    force: true,
                  },
                  options,
                ),
              );
              yield* run(
                "claim",
                Issue.edit(number, { repo, addLabels: [claimLabel] }, options),
              );
              const labels = processingLabels(yield* get(number));

              if (labels.length === 1 && labels[0] === claimLabel)
                return claimLabel;
              yield* run(
                "claim",
                Label.remove({ repo, name: claimLabel }, options),
              );

              return null;
            }),
          owns: (number, label) =>
            get(number).pipe(
              Effect.map((issue) => {
                const labels = processingLabels(issue);

                return labels.length === 1 && labels[0] === label;
              }),
            ),
          release: (label) =>
            run("release", Label.remove({ repo, name: label }, options)),
          comment: (number, body) =>
            run("comment", Issue.comment(number, { repo, body }, options)),
          complete: (number) =>
            Effect.gen(function* () {
              yield* run("complete", Issue.close(number, { repo }, options));
              yield* run(
                "complete",
                Issue.edit(
                  number,
                  { repo, removeLabels: [config.queueLabel] },
                  options,
                ),
              );
            }),
        });
      }),
    );
  }
}

const issueFields = [
  "number",
  "title",
  "body",
  "state",
  "labels",
  "comments",
] as const;

function mapIssue(issue: Issue.Selected<typeof issueFields>): QueueIssue {
  return QueueIssue.make({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state.toLowerCase() === "open" ? "open" : "closed",
    labels: issue.labels.map((label) => label.name),
    comments: issue.comments.map((comment) => ({
      author: comment.author.login,
      body: comment.body,
    })),
  });
}
