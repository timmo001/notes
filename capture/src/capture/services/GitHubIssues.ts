import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { CaptureConfig } from "../config.js";
import type { IssuePayload } from "../issuePayload.js";

export interface CreatedIssue {
  readonly number: number;
  readonly url: string;
}

export class GitHubIssueError extends Schema.TaggedError<GitHubIssueError>()(
  "GitHubIssueError",
  { message: Schema.String },
) {}

const GitHubIssueResponse = Schema.Struct({
  html_url: Schema.String,
  number: Schema.Finite,
});

export interface GitHubIssuesService {
  readonly create: (
    payload: IssuePayload,
  ) => Effect.Effect<CreatedIssue, GitHubIssueError>;
}

/** Creates queue issues in the configured notes repository. */
export class GitHubIssues extends Context.Service<
  GitHubIssues,
  GitHubIssuesService
>()("notes-capture/GitHubIssues") {
  static readonly layer = Layer.effect(
    GitHubIssues,
    Effect.gen(function* () {
      const { github } = yield* CaptureConfig;

      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
      );

      const create = Effect.fn("GitHubIssues.create")(function* (
        payload: IssuePayload,
      ) {
        const response = yield* HttpClientRequest.post(
          `https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repository)}/issues`,
        ).pipe(
          HttpClientRequest.bearerToken(github.token),
          HttpClientRequest.setHeaders({
            Accept: "application/vnd.github+json",
            "User-Agent": "notes-capture",
            "X-GitHub-Api-Version": "2022-11-28",
          }),
          HttpClientRequest.bodyJsonUnsafe(payload),
          client.execute,
          Effect.mapError(
            (error) =>
              new GitHubIssueError({
                message: error.response
                  ? `GitHub issue creation failed (${error.response.status})`
                  : "GitHub issue creation failed",
              }),
          ),
        );

        const result = yield* HttpClientResponse.schemaBodyJson(
          GitHubIssueResponse,
        )(response).pipe(
          Effect.mapError(
            () =>
              new GitHubIssueError({
                message: "GitHub returned an invalid issue response",
              }),
          ),
        );

        return { number: result.number, url: result.html_url };
      });

      return GitHubIssues.of({ create });
    }),
  );
}
