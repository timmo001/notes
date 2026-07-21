import { Context, Effect, Layer, Schema } from "effect";
import type { DaemonConfig } from "../schema.js";

/** Failure returned by the local OpenCode server boundary. */
export class OpenCodeClientError extends Schema.TaggedErrorClass<OpenCodeClientError>()(
  "OpenCodeClientError",
  { operation: Schema.String, message: Schema.String },
) {}

/** Local authenticated OpenCode operations required by the daemon. */
export interface OpenCodeClientService {
  /** Create a fresh session, submit a prompt, and return bounded final text. */
  readonly process: (
    prompt: string,
  ) => Effect.Effect<string, OpenCodeClientError>;
}

const SESSION_DENIALS = [
  "question",
  "doom_loop",
  "task",
  "cursor_delegate",
  "cursor_cloud_agent",
  "plan_enter",
  "plan_exit",
  "todowrite",
  "bash",
  "edit",
  "write",
  "apply_patch",
  "external_directory",
  "notes_note_delete",
  "browser-control_*",
  "chrome-devtools_*",
].map((permission) => ({ permission, pattern: "*", action: "deny" }));
SESSION_DENIALS.push(
  { permission: "read", pattern: "*.env", action: "deny" },
  { permission: "read", pattern: "*.env.*", action: "deny" },
  { permission: "read", pattern: "*.env.example", action: "allow" },
  { permission: "read", pattern: "**/.dev.vars", action: "deny" },
  { permission: "read", pattern: "**/.dev.vars.*", action: "deny" },
  { permission: "read", pattern: "**/*.pem", action: "deny" },
  { permission: "read", pattern: "**/*.key", action: "deny" },
  { permission: "read", pattern: "**/*.p12", action: "deny" },
  { permission: "read", pattern: "**/*.pfx", action: "deny" },
  { permission: "read", pattern: "**/*credentials*.json", action: "deny" },
  { permission: "read", pattern: "**/*secret*.json", action: "deny" },
  { permission: "read", pattern: "**/*.tfstate", action: "deny" },
  { permission: "read", pattern: "**/*.tfstate.*", action: "deny" },
);

function sessionPermissions(config: DaemonConfig) {
  return [
    ...SESSION_DENIALS,
    ...config.allowedReadPaths.map((pattern) => ({
      permission: "external_directory",
      pattern,
      action: "allow",
    })),
  ];
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
      process: (prompt) =>
        request("POST", "/session", {
          title: `Notes daemon ${config.workerId}`,
          agent: config.opencodeAgent,
          permission: sessionPermissions(config),
        }).pipe(
          Effect.flatMap((session) => decodeId(session, "session.create")),
          Effect.flatMap((sessionId) =>
            Effect.acquireUseRelease(
              Effect.succeed(sessionId),
              () =>
                Effect.raceFirst(
                  request(
                    "POST",
                    `/session/${encodeURIComponent(sessionId)}/message`,
                    {
                      agent: config.opencodeAgent,
                      parts: [{ type: "text", text: prompt }],
                    },
                  ).pipe(Effect.flatMap(decodeAssistantText)),
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
        ),
    });
  }
}

type Request = (
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
) => Effect.Effect<unknown, OpenCodeClientError>;

function makeRequest(
  config: DaemonConfig,
  username: string,
  password: string,
): Request {
  return (method, path, body) =>
    Effect.tryPromise({
      try: async (signal) => {
        const url = new URL(path, config.opencodeUrl);
        url.searchParams.set("directory", config.opencodeDirectory);
        const response = await fetch(url, {
          method,
          signal,
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok)
          throw new Error(`OpenCode returned ${response.status}`);
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? (JSON.parse(text) as unknown) : null;
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
      const [permissions, questions] = yield* Effect.all([
        request("GET", "/permission"),
        request("GET", "/question"),
      ]);
      if (containsSessionRequest(permissions, sessionId)) {
        return yield* new OpenCodeClientError({
          operation: "permission",
          message: "Headless session requested permission",
        });
      }
      if (containsSessionRequest(questions, sessionId)) {
        return yield* new OpenCodeClientError({
          operation: "question",
          message: "Headless session asked a question",
        });
      }
      yield* Effect.sleep("1 second");
    }
  });
}

function containsSessionRequest(value: unknown, sessionId: string): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        "sessionID" in entry &&
        entry.sessionID === sessionId,
    )
  );
}

function cleanupSession(request: Request, sessionId: string) {
  const path = `/session/${encodeURIComponent(sessionId)}`;
  return request("POST", `${path}/abort`).pipe(
    Effect.timeout("5 seconds"),
    Effect.ignore,
    Effect.andThen(
      request("DELETE", path).pipe(Effect.timeout("5 seconds"), Effect.ignore),
    ),
  );
}

function decodeId(value: unknown, operation: string) {
  return Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.String }))(
    value,
  ).pipe(
    Effect.map((session) => session.id),
    Effect.mapError(
      (error) => new OpenCodeClientError({ operation, message: String(error) }),
    ),
  );
}

function decodeAssistantText(value: unknown) {
  return Schema.decodeUnknownEffect(
    Schema.Struct({
      parts: Schema.Array(
        Schema.Struct({
          type: Schema.String,
          text: Schema.optional(Schema.String),
        }),
      ),
    }),
  )(value).pipe(
    Effect.map((message) =>
      message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("\n"),
    ),
    Effect.mapError(
      (error) =>
        new OpenCodeClientError({
          operation: "message.decode",
          message: String(error),
        }),
    ),
  );
}
