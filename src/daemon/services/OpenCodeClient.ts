import { Cause, Context, Effect, Layer, Schema } from "effect";
import type { DaemonConfig, OpenCodeModel } from "../schema.js";

const SUCCESS_PREFIX = "STATUS: success\n";
const FAILURE_PREFIX = "STATUS: failure\n";

/** Failure returned by the local OpenCode server boundary. */
export class OpenCodeClientError extends Schema.TaggedErrorClass<OpenCodeClientError>()(
  "OpenCodeClientError",
  { operation: Schema.String, message: Schema.String },
) {}

/** Local authenticated OpenCode operations required by the daemon. */
export interface OpenCodeClientService {
  /** Check whether the authenticated local server accepts requests. */
  readonly status: Effect.Effect<void, OpenCodeClientError>;
  /** Create a fresh session, submit a prompt, and return bounded final text. */
  readonly process: (
    prompt: string,
  ) => Effect.Effect<string, OpenCodeClientError>;
}

/** Effect service for {@link OpenCodeClientService}. */
export class OpenCodeClient extends Context.Service<
  OpenCodeClient,
  OpenCodeClientService
>()("OpenCodeClient") {
  /** Build an authenticated local OpenCode HTTP client layer. */
  static layer(config: DaemonConfig, password: string, username = "opencode") {
    const request = makeRequest(config, username, password);

    return Layer.succeed(OpenCodeClient, {
      status: request("GET", "/api/health").pipe(Effect.asVoid),
      process: (prompt) => processWithFallback(config, request, prompt),
    });
  }
}

type Request = (
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Schema.Json,
) => Effect.Effect<Schema.Json, OpenCodeClientError>;

type SessionModel =
  | { readonly providerID: string; readonly id: string }
  | {
      readonly providerID: string;
      readonly id: string;
      readonly variant: string;
    };

const processWithFallback = Effect.fn("OpenCodeClient.processWithFallback")(
  function* (config: DaemonConfig, request: Request, prompt: string) {
    let lastError: OpenCodeClientError | undefined;
    for (const [index, model] of config.opencodeModels.entries()) {
      const result = yield* Effect.exit(
        processWithModel(config, request, prompt, model),
      );
      if (result._tag === "Success") {
        const response = result.value.trim();
        if (response.startsWith(SUCCESS_PREFIX)) {
          const summary = response.slice(SUCCESS_PREFIX.length).trim();
          if (summary) return summary;
        }

        const message = response.startsWith(FAILURE_PREFIX)
          ? response.slice(FAILURE_PREFIX.length).trim() ||
            "Agent reported failure"
          : "Agent returned a result without a valid status line";
        lastError = new OpenCodeClientError({
          operation: "message.status",
          message,
        });
        if (index < config.opencodeModels.length - 1) {
          console.warn(
            `[notes-daemon] model failed model=${modelName(model)} operation=${lastError.operation} message=${lastError.message}; trying fallback`,
          );
        }
        continue;
      }

      const failure = Cause.squash(result.cause);
      if (!(failure instanceof OpenCodeClientError)) {
        return yield* new OpenCodeClientError({
          operation: "process",
          message: `Model ${modelName(model)} failed without a typed error`,
        });
      }
      lastError = failure;
      if (index < config.opencodeModels.length - 1) {
        console.warn(
          `[notes-daemon] model failed model=${modelName(model)} operation=${lastError.operation} message=${lastError.message}; trying fallback`,
        );
      }
    }

    return yield* new OpenCodeClientError({
      operation: "process.models",
      message: `All models failed (${config.opencodeModels.map(modelName).join(", ")}): ${lastError?.message ?? "unknown error"}`,
    });
  },
);

function processWithModel(
  config: DaemonConfig,
  request: Request,
  prompt: string,
  model: OpenCodeModel,
) {
  const selectedModel: SessionModel =
    model.variant === undefined
      ? { providerID: model.providerID, id: model.modelID }
      : {
          providerID: model.providerID,
          id: model.modelID,
          variant: model.variant,
        };

  return request("POST", "/api/session", {
    title: `Notes daemon ${config.workerId}`,
    agent: config.opencodeAgent,
    model: selectedModel,
    location: { directory: config.opencodeDirectory },
  }).pipe(
    Effect.flatMap((session) => decodeId(session, "session.create")),
    Effect.flatMap((sessionId) =>
      Effect.acquireUseRelease(
        Effect.succeed(sessionId),
        () =>
          Effect.raceFirst(
            request("POST", sessionPath(sessionId, "prompt"), {
              text: prompt,
            }).pipe(
              Effect.andThen(request("POST", sessionPath(sessionId, "wait"))),
              Effect.andThen(
                request(
                  "GET",
                  `${sessionPath(sessionId, "message")}?order=desc&limit=20`,
                ),
              ),
              Effect.flatMap(decodeAssistantText),
            ),
            monitorHeadlessState(request, sessionId),
          ).pipe(
            Effect.timeout(`${config.sessionTimeoutSeconds} seconds`),
            Effect.mapError((error) =>
              error instanceof OpenCodeClientError
                ? error
                : new OpenCodeClientError({
                    operation: "process",
                    message: String(error),
                  }),
            ),
          ),
        () => cleanupSession(request, sessionId),
      ),
    ),
  );
}

function modelName(model: OpenCodeModel) {
  return `${model.providerID}/${model.modelID}${model.variant ? `/${model.variant}` : ""}`;
}

function makeRequest(
  config: DaemonConfig,
  username: string,
  password: string,
): Request {
  return (method, path, body) =>
    Effect.tryPromise({
      try: async (signal) => {
        const url = new URL(path, config.opencodeUrl);
        const headers = new Headers({
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        });
        const init: RequestInit = {
          method,
          signal,
          headers,
        };
        if (body !== undefined) {
          headers.set("Content-Type", "application/json");
          init.body = JSON.stringify(body);
        }
        const response = await fetch(url, init);
        if (!response.ok) {
          const detail = (await response.text())
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 500);
          throw new Error(
            `OpenCode returned ${response.status}${detail ? `: ${detail}` : ""}`,
          );
        }
        if (response.status === 204) return null;
        const text = await response.text();
        return text
          ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(text)
          : null;
      },
      catch: (error) =>
        new OpenCodeClientError({
          operation: `${method} ${path}`,
          message: error instanceof Error ? error.message : String(error),
        }),
    });
}

function monitorHeadlessState(request: Request, sessionId: string) {
  return Effect.gen(function* () {
    while (true) {
      const [permissions, forms] = yield* Effect.all([
        request("GET", sessionPath(sessionId, "permission")),
        request("GET", sessionPath(sessionId, "form")),
      ]);
      if (containsSessionRequest(permissions, sessionId)) {
        return yield* new OpenCodeClientError({
          operation: "permission",
          message: "Headless session requested permission",
        });
      }
      if (containsSessionRequest(forms, sessionId)) {
        return yield* new OpenCodeClientError({
          operation: "form",
          message: "Headless session requested input",
        });
      }
      yield* Effect.sleep("1 second");
    }
  });
}

const SessionRequests = Schema.Struct({
  data: Schema.Array(Schema.Struct({ sessionID: Schema.String })),
});

function containsSessionRequest(
  value: Schema.Json,
  sessionId: string,
): boolean {
  return (
    Schema.is(SessionRequests)(value) &&
    value.data.some((entry) => entry.sessionID === sessionId)
  );
}

function cleanupSession(request: Request, sessionId: string) {
  const path = sessionPath(sessionId);
  return request("POST", `${path}/interrupt`).pipe(
    Effect.timeout("5 seconds"),
    Effect.ignore,
    Effect.andThen(
      request("DELETE", path).pipe(Effect.timeout("5 seconds"), Effect.ignore),
    ),
  );
}

function decodeId(value: Schema.Json, operation: string) {
  return Schema.decodeUnknownEffect(
    Schema.Struct({ data: Schema.Struct({ id: Schema.String }) }),
  )(value).pipe(
    Effect.map((response) => response.data.id),
    Effect.mapError(
      (error) => new OpenCodeClientError({ operation, message: String(error) }),
    ),
  );
}

function decodeAssistantText(value: Schema.Json) {
  return Schema.decodeUnknownEffect(
    Schema.Struct({
      data: Schema.Array(
        Schema.Struct({
          type: Schema.String,
          content: Schema.optional(
            Schema.Array(
              Schema.Struct({
                type: Schema.String,
                text: Schema.optional(Schema.String),
              }),
            ),
          ),
        }),
      ),
    }),
  )(value).pipe(
    Effect.flatMap((response) => {
      const message = response.data.find((entry) => entry.type === "assistant");
      const text = (message?.content ?? [])
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n")
        .trim();
      return text
        ? Effect.succeed(text)
        : Effect.fail(
            new OpenCodeClientError({
              operation: "message.decode",
              message: "OpenCode returned no assistant text",
            }),
          );
    }),
    Effect.mapError((error) =>
      error instanceof OpenCodeClientError
        ? error
        : new OpenCodeClientError({
            operation: "message.decode",
            message: String(error),
          }),
    ),
  );
}

function sessionPath(sessionId: string, suffix?: string) {
  const path = `/api/session/${encodeURIComponent(sessionId)}`;
  return suffix ? `${path}/${suffix}` : path;
}
