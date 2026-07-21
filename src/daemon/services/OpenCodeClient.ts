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

/** Effect service for {@link OpenCodeClientService}. */
export class OpenCodeClient extends Context.Service<
  OpenCodeClient,
  OpenCodeClientService
>()("OpenCodeClient") {
  /** Build an authenticated local OpenCode HTTP client layer. */
  static layer(config: DaemonConfig, password: string, username = "opencode") {
    return Layer.succeed(OpenCodeClient, {
      process: (prompt) =>
        requestJson(
          config.opencodeUrl,
          "/session",
          config.opencodeDirectory,
          username,
          password,
          {
            title: `Notes daemon ${config.workerId}`,
            permission: [{ permission: "*", pattern: "*", action: "deny" }],
          },
        ).pipe(
          Effect.flatMap((session) => decodeId(session, "session.create")),
          Effect.flatMap((id) =>
            requestJson(
              config.opencodeUrl,
              `/session/${encodeURIComponent(id)}/message`,
              config.opencodeDirectory,
              username,
              password,
              {
                parts: [{ type: "text", text: prompt }],
                tools: {
                  "*": false,
                  skill: true,
                  github_web_search: true,
                  github_search_repositories: true,
                  github_get_file_contents: true,
                  notes_note_list: true,
                  notes_note_read: true,
                  notes_note_write: true,
                },
              },
            ),
          ),
          Effect.flatMap(decodeAssistantText),
          Effect.timeout("10 minutes"),
          Effect.mapError((error) =>
            error instanceof OpenCodeClientError
              ? error
              : new OpenCodeClientError({
                  operation: "process",
                  message: String(error),
                }),
          ),
        ),
    });
  }
}

function requestJson(
  baseUrl: string,
  path: string,
  directory: string,
  username: string,
  password: string,
  body: unknown,
) {
  return Effect.tryPromise({
    try: async (signal) => {
      const url = new URL(path, baseUrl);
      url.searchParams.set("directory", directory);
      const response = await fetch(url, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`OpenCode returned ${response.status}`);
      return (await response.json()) as unknown;
    },
    catch: (error) =>
      new OpenCodeClientError({
        operation: path,
        message: error instanceof Error ? error.message : String(error),
      }),
  });
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
