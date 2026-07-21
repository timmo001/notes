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
        const json = Effect.fn("IssueQueue.ghJson")(function* (
          operation: string,
          args: readonly string[],
        ) {
          const output = yield* executor
            .run("gh", args)
            .pipe(
              Effect.mapError(
                (error) =>
                  new IssueQueueError({ operation, message: error.stderr }),
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
          comment: (number, body) =>
            executor
              .run("gh", [
                "issue",
                "comment",
                String(number),
                "--repo",
                config.repository,
                "--body",
                body,
              ])
              .pipe(
                Effect.asVoid,
                Effect.mapError(
                  (error) =>
                    new IssueQueueError({
                      operation: "comment",
                      message: error.stderr,
                    }),
                ),
              ),
          complete: (number) =>
            Effect.gen(function* () {
              yield* executor.run("gh", [
                "issue",
                "edit",
                String(number),
                "--repo",
                config.repository,
                "--remove-label",
                config.queueLabel,
              ]);
              yield* executor.run("gh", [
                "issue",
                "close",
                String(number),
                "--repo",
                config.repository,
              ]);
            }).pipe(
              Effect.asVoid,
              Effect.mapError(
                (error) =>
                  new IssueQueueError({
                    operation: "complete",
                    message: error.stderr,
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
