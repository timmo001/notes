import { Cause, Context, Effect, Schema } from "effect";
import { McpSchema, McpServer, Tool } from "effect/ai";

/** MCP tool annotations for a read-only, closed-world, idempotent tool. */
export const READONLY_HINTS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** MCP tool annotations for a destructive, closed-world tool. */
export const DESTRUCTIVE_HINTS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** Behavioural hint sets accepted by a ToolRegistrar. */
export type ToolHints = typeof READONLY_HINTS | typeof DESTRUCTIVE_HINTS;

/** Schema for a typed tool result; it must encode to a JSON object. */
export type ToolSuccessSchema = Schema.Codec<unknown, Schema.JsonObject>;

/** Text and structured content returned by a typed tool handler. */
export interface TypedToolResult<A> {
  /** Text content, kept for clients that ignore structured content. */
  readonly text: string;
  /** Structured content, encoded through the tool's success schema. */
  readonly structured: A;
}

/** Options describing a single MCP tool registration. */
export type ToolRegistration<
  S extends Schema.Codec<unknown, unknown>,
  E,
  O extends ToolSuccessSchema = never,
> = TextToolRegistration<S, E> | TypedToolRegistration<S, E, O>;

interface ToolRegistrationOptions<S extends Schema.Codec<unknown, unknown>> {
  /** Tool name as exposed to MCP clients. */
  readonly name: string;
  /** Human-readable tool description. */
  readonly description: string;
  /** Effect schema for the tool's input parameters. */
  readonly parameters: S;
  /** Behavioural hints. */
  readonly annotations: ToolHints;
}

/** A tool returning raw text only. */
export interface TextToolRegistration<
  S extends Schema.Codec<unknown, unknown>,
  E,
> extends ToolRegistrationOptions<S> {
  readonly success?: undefined;
  /** Handler returning raw text; failures render via Cause.pretty. */
  readonly handle: (params: S["Type"]) => Effect.Effect<string, E>;
}

/** A tool declaring an output schema and returning structured content. */
export interface TypedToolRegistration<
  S extends Schema.Codec<unknown, unknown>,
  E,
  O extends ToolSuccessSchema,
> extends ToolRegistrationOptions<S> {
  /** Effect schema for the tool's structured result. */
  readonly success: O;
  /** Handler returning text and structured content; failures render via Cause.pretty. */
  readonly handle: (
    params: S["Type"],
  ) => Effect.Effect<TypedToolResult<O["Type"]>, E>;
}

/** Registers a raw-text or typed tool on the current MCP server. */
export interface ToolRegistrar {
  <S extends Schema.Codec<unknown, unknown>, E, O extends ToolSuccessSchema>(
    options: TypedToolRegistration<S, E, O>,
  ): Effect.Effect<void>;
  <S extends Schema.Codec<unknown, unknown>, E>(
    options: TextToolRegistration<S, E>,
  ): Effect.Effect<void>;
}

function isTyped<
  S extends Schema.Codec<unknown, unknown>,
  E,
  O extends ToolSuccessSchema,
>(
  options: ToolRegistration<S, E, O>,
): options is TypedToolRegistration<S, E, O> {
  return options.success !== undefined;
}

/** Acquire a ToolRegistrar bound to the current MCP server. */
export const toolRegistrar: Effect.Effect<
  ToolRegistrar,
  never,
  McpServer.McpServer
> = Effect.gen(function* () {
  const server = yield* McpServer.McpServer;

  const register: ToolRegistrar = <
    S extends Schema.Codec<unknown, unknown>,
    E,
    O extends ToolSuccessSchema,
  >(
    options: ToolRegistration<S, E, O>,
  ) => {
    const decode = Schema.decodeEffect(options.parameters);

    const respond = (
      params: S["Type"],
    ): Effect.Effect<
      { readonly text: string; readonly structured?: Schema.JsonObject },
      E | Schema.SchemaError
    > => {
      if (!isTyped(options))
        return options.handle(params).pipe(Effect.map((text) => ({ text })));

      const encode = Schema.encodeEffect(options.success);

      return options
        .handle(params)
        .pipe(
          Effect.flatMap(({ text, structured }) =>
            encode(structured).pipe(
              Effect.map((encoded) => ({ text, structured: encoded })),
            ),
          ),
        );
    };

    return server.addTool({
      tool: new McpSchema.Tool({
        name: options.name,
        description: options.description,
        inputSchema: Tool.getJsonSchemaFromSchema(options.parameters),
        ...(options.success && {
          outputSchema: Tool.getJsonSchemaFromSchema(options.success),
        }),
        annotations: options.annotations,
      }),
      annotations: Context.empty(),
      handle: (payload) =>
        decode(payload).pipe(
          Effect.flatMap(respond),
          Effect.matchCause({
            onFailure: (cause) =>
              new McpSchema.CallToolResult({
                isError: true,
                content: [{ type: "text", text: Cause.pretty(cause) }],
              }),
            onSuccess: ({ text, structured }) =>
              new McpSchema.CallToolResult({
                isError: false,
                content: [{ type: "text", text }],
                ...(structured && { structuredContent: structured }),
              }),
          }),
        ),
    });
  };

  return register;
});
