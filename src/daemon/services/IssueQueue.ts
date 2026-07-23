import { Context, Effect, Layer, Schema } from "effect";
import { CommandExecutor } from "../../services/CommandExecutor.js";
import { QueueIssue, type DaemonConfig } from "../schema.js";

/** Failure returned by the GitHub issue queue boundary. */
export class IssueQueueError extends Schema.TaggedErrorClass<IssueQueueError>()(
  "IssueQueueError",
  { operation: Schema.String, message: Schema.String },
) {}

/** GitHub issue queue operations required by the daemon coordinator. */
export interface IssueQueueService {
  /** List open issues carrying the configured queue label. */
  readonly list: () => Effect.Effect<readonly QueueIssue[], IssueQueueError>;
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
        const executor = yield* CommandExecutor;
        const run = (args: readonly string[]) =>
          executor
            .run("gh", args)
            .pipe(Effect.timeout(`${config.commandTimeoutSeconds} seconds`));
        const json = Effect.fn("IssueQueue.ghJson")(function* (
          operation: string,
          args: readonly string[],
        ) {
          const output = yield* run(args).pipe(
            Effect.mapError(
              (error) =>
                new IssueQueueError({ operation, message: String(error) }),
            ),
          );
          return yield* Effect.try({
            try: () => JSON.parse(output) as unknown,
            catch: (error) =>
              new IssueQueueError({
                operation,
                message: error instanceof Error ? error.message : String(error),
              }),
          });
        });
        const get = Effect.fn("IssueQueue.get")(function* (number: number) {
          return yield* json("get", [
            "issue",
            "view",
            String(number),
            "--repo",
            config.repository,
            "--json",
            "number,title,body,state,labels,comments",
          ]).pipe(Effect.flatMap(decodeIssue));
        });
        const claimLabel = `agent:processing:${config.workerId}:${crypto.randomUUID().slice(0, 8)}`;
        const processingLabels = (issue: QueueIssue) =>
          issue.labels.filter((label) => label.startsWith("agent:processing:"));

        return IssueQueue.of({
          list: () =>
            json("list", [
              "issue",
              "list",
              "--repo",
              config.repository,
              "--state",
              "open",
              "--label",
              config.queueLabel,
              "--limit",
              "100",
              "--json",
              "number,title,body,state,labels,comments",
            ]).pipe(
              Effect.flatMap((value) =>
                Schema.decodeUnknownEffect(Schema.Array(GhIssue))(value),
              ),
              Effect.map((issues) => issues.map(mapIssue)),
              Effect.mapError((error) =>
                error instanceof IssueQueueError
                  ? error
                  : new IssueQueueError({
                      operation: "list.decode",
                      message: String(error),
                    }),
              ),
            ),
          get,
          claim: (number) =>
            Effect.gen(function* () {
              if (processingLabels(yield* get(number)).length > 0) return null;
              yield* run([
                "label",
                "create",
                claimLabel,
                "--repo",
                config.repository,
                "--color",
                "D9AF59",
                "--description",
                `Claimed by notes daemon worker ${config.workerId}`,
                "--force",
              ]);
              yield* run([
                "issue",
                "edit",
                String(number),
                "--repo",
                config.repository,
                "--add-label",
                claimLabel,
              ]);
              const labels = processingLabels(yield* get(number));
              if (labels.length === 1 && labels[0] === claimLabel)
                return claimLabel;
              yield* run([
                "label",
                "delete",
                claimLabel,
                "--repo",
                config.repository,
                "--yes",
              ]);
              return null;
            }).pipe(
              Effect.mapError((error) =>
                error instanceof IssueQueueError
                  ? error
                  : new IssueQueueError({
                      operation: "claim",
                      message: String(error),
                    }),
              ),
            ),
          owns: (number, label) =>
            get(number).pipe(
              Effect.map((issue) => {
                const labels = processingLabels(issue);
                return labels.length === 1 && labels[0] === label;
              }),
            ),
          release: (label) =>
            run([
              "label",
              "delete",
              label,
              "--repo",
              config.repository,
              "--yes",
            ]).pipe(
              Effect.asVoid,
              Effect.mapError(
                (error) =>
                  new IssueQueueError({
                    operation: "release",
                    message: String(error),
                  }),
              ),
            ),
          comment: (number, body) =>
            run([
              "issue",
              "comment",
              String(number),
              "--repo",
              config.repository,
              "--body",
              body,
            ]).pipe(
              Effect.asVoid,
              Effect.mapError(
                (error) =>
                  new IssueQueueError({
                    operation: "comment",
                    message: String(error),
                  }),
              ),
            ),
          complete: (number) =>
            Effect.gen(function* () {
              yield* run([
                "issue",
                "close",
                String(number),
                "--repo",
                config.repository,
              ]);
              yield* run([
                "issue",
                "edit",
                String(number),
                "--repo",
                config.repository,
                "--remove-label",
                config.queueLabel,
              ]);
            }).pipe(
              Effect.asVoid,
              Effect.mapError(
                (error) =>
                  new IssueQueueError({
                    operation: "complete",
                    message: String(error),
                  }),
              ),
            ),
        });
      }),
    );
  }
}

const GhIssue = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  body: Schema.String,
  state: Schema.String,
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  comments: Schema.Array(
    Schema.Struct({
      author: Schema.Struct({ login: Schema.String }),
      body: Schema.String,
    }),
  ),
});

function mapIssue(issue: typeof GhIssue.Type): QueueIssue {
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

function decodeIssue(value: unknown) {
  return Schema.decodeUnknownEffect(GhIssue)(value).pipe(
    Effect.map(mapIssue),
    Effect.mapError(
      (error) =>
        new IssueQueueError({
          operation: "get.decode",
          message: String(error),
        }),
    ),
  );
}
