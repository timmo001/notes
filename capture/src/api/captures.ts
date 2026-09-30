import { Effect, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import { CaptureConfig } from "../capture/config.js";
import { CAPTURE_ERRORS, type CaptureError } from "../capture/http.js";
import { buildIssuePayload } from "../capture/issuePayload.js";
import {
  validateTargetRepository,
  type RepositoryOption,
} from "../capture/repositories.js";
import { CaptureInput } from "../capture/schema.js";
import {
  GitHubIssues,
  type CreatedIssue,
} from "../capture/services/GitHubIssues.js";

const MAX_REQUEST_BYTES = 16_384;

const CaptureFailureFields = {
  reason: Schema.String,
  status: Schema.Finite,
  error: Schema.Literals(Object.values(CAPTURE_ERRORS)),
  requestId: Schema.optional(Schema.String),
  bytes: Schema.optional(Schema.Finite),
};

/** A capture the client sent in an unacceptable shape. */
export class CaptureRejected extends Schema.TaggedError<CaptureRejected>()(
  "CaptureRejected",
  CaptureFailureFields,
) {}

/** A valid capture the Worker could not queue. */
export class CaptureFailed extends Schema.TaggedError<CaptureFailed>()(
  "CaptureFailed",
  CaptureFailureFields,
) {}

type CaptureResponseBody =
  | CreatedIssue
  | { readonly error: CaptureError }
  | { readonly repositories: readonly RepositoryOption[] };

function json(data: CaptureResponseBody, status: number) {
  return HttpServerResponse.jsonUnsafe(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function respondWithFailure(
  message: string,
  log: (message: string) => Effect.Effect<void>,
) {
  return (failure: CaptureRejected | CaptureFailed) =>
    log(message).pipe(
      Effect.annotateLogs({
        reason: failure.reason,
        status: failure.status,
        requestId: failure.requestId,
        bytes: failure.bytes,
      }),
      Effect.as(json({ error: failure.error }, failure.status)),
    );
}

export const postCapture = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;

  if (request.headers["content-type"] !== "application/json") {
    return yield* new CaptureRejected({
      reason: "content-type",
      status: 415,
      error: CAPTURE_ERRORS.expectedJson,
    });
  }

  const length = Number(request.headers["content-length"] ?? 0);

  if (length > MAX_REQUEST_BYTES) {
    return yield* new CaptureRejected({
      reason: "declared-size",
      status: 413,
      error: CAPTURE_ERRORS.tooLarge,
      bytes: length,
    });
  }

  const invalidCapture = () =>
    new CaptureRejected({
      reason: "invalid-capture",
      status: 400,
      error: CAPTURE_ERRORS.invalidCapture,
    });

  const raw = yield* request.text.pipe(Effect.mapError(invalidCapture));
  const bytes = new TextEncoder().encode(raw).byteLength;

  if (bytes > MAX_REQUEST_BYTES) {
    return yield* new CaptureRejected({
      reason: "measured-size",
      status: 413,
      error: CAPTURE_ERRORS.tooLarge,
      bytes,
    });
  }

  const capture = yield* Schema.decodeEffect(
    Schema.fromJsonString(CaptureInput),
  )(raw).pipe(Effect.mapError(invalidCapture));

  const config = yield* CaptureConfig;

  const repositories = yield* config.repositories.pipe(
    Effect.mapError(
      () =>
        new CaptureFailed({
          reason: "repository-configuration",
          status: 500,
          error: CAPTURE_ERRORS.invalidConfiguration,
          requestId: capture.requestId,
        }),
    ),
  );

  yield* Effect.try({
    try: () => validateTargetRepository(capture.repository, repositories),
    catch: () =>
      new CaptureRejected({
        reason: "invalid-repository",
        status: 400,
        error: CAPTURE_ERRORS.invalidRepository,
        requestId: capture.requestId,
      }),
  });

  const issues = yield* GitHubIssues;

  const issue = yield* issues
    .create(buildIssuePayload(capture, config.queueLabel))
    .pipe(
      Effect.mapError(
        () =>
          new CaptureFailed({
            reason: "queue",
            status: 502,
            error: CAPTURE_ERRORS.queueFailed,
            requestId: capture.requestId,
          }),
      ),
    );

  return json(issue, 201);
}).pipe(
  Effect.catchTags({
    CaptureRejected: respondWithFailure(
      "Capture submission rejected",
      Effect.logWarning,
    ),
    CaptureFailed: respondWithFailure(
      "Capture submission failed",
      Effect.logError,
    ),
  }),
);

export const getRepositories = Effect.gen(function* () {
  const { repositories } = yield* CaptureConfig;

  return json({ repositories: (yield* repositories) ?? [] }, 200);
}).pipe(
  Effect.catchTag("InvalidRepositoryConfig", () =>
    Effect.logError("Capture repositories failed").pipe(
      Effect.annotateLogs({ reason: "repository-configuration", status: 500 }),
      Effect.as(json({ error: CAPTURE_ERRORS.invalidConfiguration }, 500)),
    ),
  ),
);
