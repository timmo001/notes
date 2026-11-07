/**
 * The Code Mode surface. `notes agent tools --json` describes each tool, and
 * `notes agent call <tool>` runs one with its input as JSON on stdin, in the
 * current directory's repository, so the OpenCode plugin in
 * `opencode-plugin/` only needs the binary, and its tools always match it.
 */
import {
  createNote,
  deleteNote,
  listAllHandoffs,
  listAllNotes,
  listHandoffs,
  listNotes,
  listNoteTargets,
  moveNote,
  noteContext,
  type Notes,
  type NotesError,
  notesRoot,
  readNote,
  searchNotes,
  setNotePriority,
  writeNote,
} from "@timmo001/effect-notes";
import { DateTime, Duration, Effect, Option, Predicate, Schema } from "effect";

/** Why a Code Mode call failed. */
export class AgentError extends Schema.TaggedError<AgentError>()("AgentError", {
  message: Schema.String,
}) {}

const JsonObject = Schema.Record(Schema.String, Schema.Json);

/** One tool as the plugin registers it. */
export const ManifestTool = Schema.Struct({
  name: Schema.String,
  argv: Schema.Array(Schema.String),
  description: Schema.String,
  access: Schema.Literals(["read", "write"]),
  alwaysAsk: Schema.Boolean,
  pinned: Schema.Boolean,
  timeoutMillis: Schema.Int,
  json: Schema.Boolean,
  stdin: Schema.Boolean,
  input: JsonObject,
  resource: Schema.optionalKey(Schema.String),
});

/** Every tool, and whether there's anything to call them on. */
export const Manifest = Schema.Struct({
  available: Schema.Boolean,
  tools: Schema.Array(ManifestTool),
});

type Context = Notes;

interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly access: "read" | "write";
  readonly pinned: boolean;
  readonly input: Schema.Json;
  readonly call: (text: string) => Effect.Effect<string, AgentError, Context>;
}

const timeout = Duration.minutes(2);

const isJsonObject = Schema.is(JsonObject);

const decodeJson = Schema.decodeUnknownSync(Schema.Json);

const jsonSchemaOf = (schema: Schema.Top) => {
  const document = Schema.toJsonSchemaDocument(schema, {
    onExcessProperty: "error",
  });

  return decodeJson(
    Object.keys(document.definitions).length === 0
      ? document.schema
      : { ...document.schema, $defs: document.definitions },
  );
};

/**
 * A result as plain JSON: options become their value or null, and dates ISO
 * strings, so results read the way the CLI's `--format json` prints them.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns
const plain = (value: unknown): unknown => {
  if (Option.isOption(value))
    return Option.isSome(value) ? plain(value.value) : null;

  if (value instanceof Date) return value.toISOString();

  if (DateTime.isDateTime(value)) return DateTime.formatIso(value);

  if (Predicate.isBigInt(value)) return value.toString();

  if (Array.isArray(value)) return value.map(plain);

  if (Predicate.isObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("~"))
        .map(([key, item]) => [key, plain(item)]),
    );

  return value;
};

const tool = <I, IE, A>(definition: {
  readonly name: string;
  readonly description: string;
  readonly access: "read" | "write";
  readonly pinned?: boolean;
  readonly input: Schema.Codec<I, IE>;
  readonly run: (input: I) => Effect.Effect<A, NotesError, Context>;
}): AgentTool => {
  const decode = Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.toCodecJson(definition.input)),
  );

  return {
    name: definition.name,
    description: definition.description,
    access: definition.access,
    pinned: definition.pinned ?? false,
    input: jsonSchemaOf(definition.input),
    call: (text) =>
      Effect.gen(function* () {
        const input = yield* decode(text.trim() === "" ? "{}" : text, {
          onExcessProperty: "error",
          errors: "all",
        }).pipe(
          Effect.mapError(
            (error) =>
              new AgentError({ message: `Invalid input: ${error.message}` }),
          ),
        );

        const result = yield* definition.run(input).pipe(
          Effect.mapError(
            (error) =>
              new AgentError({
                message:
                  error.detail === undefined
                    ? error.message
                    : `${error.message}\n${error.detail}`,
              }),
          ),
          Effect.timeoutOrElse({
            duration: timeout,
            orElse: () =>
              Effect.fail(
                new AgentError({ message: `${definition.name} timed out` }),
              ),
          }),
        );

        return JSON.stringify(
          result === undefined ? { ok: true } : plain(result),
          null,
          2,
        );
      }),
  };
};

const notePath = Schema.String.annotate({
  description: "Absolute path to a note file inside the notes vault",
});

const allProjects = Schema.optionalKey(Schema.Boolean).annotate({
  description:
    "Include notes from every projects directory, not only the current repository",
});

const tag = Schema.optionalKey(Schema.String).annotate({
  description: "Only include notes with this tag",
});

// Struct({}) accepts any keys, so a tool that takes none uses this instead.
const NoInput = Schema.Record(Schema.String, Schema.Never);

/** Every Code Mode tool, in the order the catalogue lists them. */
export const agentTools: ReadonlyArray<AgentTool> = [
  tool({
    name: "root",
    description: "Print the notes vault root, or the projects directory.",
    access: "read",
    input: Schema.Struct({
      projects: Schema.optionalKey(Schema.Boolean).annotate({
        description: "Print the projects directory instead",
      }),
    }),
    run: (input) => notesRoot({ projects: input.projects ?? false }),
  }),
  tool({
    name: "context",
    description:
      "Resolve the project-note context for the current repository: its owner/repo slug, notes path and notes.",
    access: "read",
    input: NoInput,
    run: () => noteContext("codemode"),
  }),
  tool({
    name: "list",
    description: "List the repository's notes.",
    access: "read",
    pinned: true,
    input: Schema.Struct({ all: allProjects, tag }),
    run: (input): Effect.Effect<unknown, NotesError, Context> =>
      input.all
        ? listAllNotes({ tag: input.tag })
        : listNotes({ tag: input.tag }),
  }),
  tool({
    name: "search",
    description: "Fuzzy-search note metadata.",
    access: "read",
    pinned: true,
    input: Schema.Struct({
      query: Schema.String.annotate({ description: "Fuzzy search text" }),
      all: allProjects,
      tag,
    }),
    run: (input) =>
      searchNotes({
        query: input.query,
        all: input.all ?? false,
        tag: input.tag,
      }),
  }),
  tool({
    name: "read",
    description: "Read a note's content and SHA-256 revision hash.",
    access: "read",
    pinned: true,
    input: Schema.Struct({ path: notePath }),
    run: (input) => readNote(input.path),
  }),
  tool({
    name: "targets",
    description: "List the known repository scopes notes can belong to.",
    access: "read",
    input: NoInput,
    run: () => listNoteTargets(),
  }),
  tool({
    name: "handoffs",
    description: "List handoff-tagged notes.",
    access: "read",
    input: Schema.Struct({ all: allProjects }),
    run: (input): Effect.Effect<unknown, NotesError, Context> =>
      input.all ? listAllHandoffs() : listHandoffs(),
  }),
  tool({
    name: "write",
    description: "Replace a note's content, then commit and push it.",
    access: "write",
    input: Schema.Struct({
      path: notePath,
      content: Schema.String.annotate({
        description: "The note's complete new content",
      }),
      expectedHash: Schema.optionalKey(Schema.String).annotate({
        description:
          "Fail if the note no longer has this SHA-256 hash, from read",
      }),
    }),
    run: (input) =>
      writeNote({
        path: input.path,
        content: input.content,
        expectedHash: input.expectedHash,
      }),
  }),
  tool({
    name: "create",
    description: "Create a note, then commit and push it.",
    access: "write",
    input: Schema.Struct({
      name: Schema.String.annotate({ description: "Note name" }),
      content: Schema.String.annotate({ description: "The note body" }),
      description: Schema.String.annotate({ description: "Note description" }),
      repository: Schema.String.annotate({
        description:
          "Repository scope for the new note, such as timmo001/notes, from targets or context",
      }),
      kind: Schema.optionalKey(Schema.Literals(["note", "handoff"])).annotate({
        description: "Note template kind (default: note)",
      }),
    }),
    run: (input) =>
      createNote({
        repository: input.repository,
        kind: input.kind ?? "note",
        name: input.name,
        description: input.description,
        body: input.content,
      }),
  }),
  tool({
    name: "delete",
    description: "Delete a note, then commit and push it.",
    access: "write",
    input: Schema.Struct({ path: notePath }),
    run: (input) => deleteNote(input.path),
  }),
  tool({
    name: "move",
    description:
      "Move a note to another known repository scope, then commit and push it.",
    access: "write",
    input: Schema.Struct({
      path: notePath,
      to: Schema.String.annotate({
        description: "Existing or remembered repository scope",
      }),
    }),
    run: (input) => moveNote({ path: input.path, to: input.to }),
  }),
  tool({
    name: "priority",
    description: "Set a note's priority, then commit and push it.",
    access: "write",
    input: Schema.Struct({
      path: notePath,
      value: Schema.Literals(["low", "medium", "high", "critical"]),
    }),
    run: (input) =>
      setNotePriority({ path: input.path, priority: input.value }),
  }),
];

/** The tool names `agent call` accepts. */
export const toolNames = agentTools.map(({ name }) => name);

/** The Code Mode manifest. The tools need only git, so they're always available. */
export const manifest = () => ({
  available: true,
  tools: agentTools.map((entry) => ({
    name: entry.name,
    argv: ["agent", "call", entry.name],
    description: entry.description,
    access: entry.access,
    alwaysAsk: false,
    pinned: entry.pinned,
    timeoutMillis: Duration.toMillis(timeout),
    json: true,
    stdin: true,
    input: isJsonObject(entry.input) ? entry.input : {},
  })),
});

/** Run one tool with its JSON input and return its JSON result. */
export const call = Effect.fn("agentCall")(function* (
  name: string,
  text: string,
) {
  const entry = agentTools.find((candidate) => candidate.name === name);

  if (entry === undefined) {
    return yield* new AgentError({ message: `No tool ${name}` });
  }

  return yield* entry.call(text);
});
