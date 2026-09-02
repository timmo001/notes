import { Cause, Console, Effect, Layer, Schema } from "effect";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { CliError, Command, Flag } from "effect/unstable/cli";
import { basename } from "node:path";
import {
  detectAgentTargets,
  openNoteAgent,
  type AgentCommandRunner,
} from "./notes/agentTargets.js";
import { searchNoteEntries } from "./notes/search.js";
import { setHelpRenderer } from "./cli/help.js";
import {
  CommandExecutor,
  type CommandExecutorService,
} from "./services/CommandExecutor.js";
import { Config } from "./services/Config.js";
import { runDaemon } from "./daemon/run.js";
import { captureStatus, processLocalCapture } from "./capture/run.js";
import { Notes, NotesError } from "./notes/services/Notes.js";
import {
  formatNoteLabel,
  formatNoteSections,
  isHandoff,
  notePriority,
  priorityLabel,
  priorityRank,
  type NoteDeleteResult,
  type NoteEntry,
  type NoteGitResult,
  type NotePushResult,
  type NoteRepoSection,
  type NotesViewFilter,
  type NotesListFormat,
  type NoteWriteResult,
  type NoteMoveResult,
} from "./notes/types.js";

type TuiMode = {
  readonly initialNotesFilter?: NotesViewFilter;
};

class UsageError extends Schema.TaggedErrorClass<UsageError>()("UsageError", {
  message: Schema.String,
}) {}

function invokedCommand(): string | undefined {
  const name = basename(process.argv[1] ?? "");
  return name === "handoffs" || name === "handoff" ? "handoffs" : undefined;
}

function writeText(text: string): Effect.Effect<void> {
  return Effect.sync(() => process.stdout.write(text));
}

function writeLine(text: string): Effect.Effect<void> {
  return writeText(`${text}\n`);
}

function exitWithError(lines: readonly string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function handleNotesError<R>(effect: Effect.Effect<void, NotesError, R>) {
  return effect.pipe(
    Effect.catch((error) =>
      Effect.promise(async () => {
        exitWithError(
          error.detail
            ? [`[notes] ${error.message}`, error.detail]
            : [`[notes] ${error.message}`],
        );
      }),
    ),
  );
}

function formatPushLine(push: NotePushResult): string {
  return push.ok
    ? `Pushed to remote: ${push.message}`
    : `Push failed (non-fatal): ${push.error ?? "unknown error"}`;
}

function emitNoteResult(
  result: NoteWriteResult | NoteDeleteResult | NoteMoveResult,
  json: boolean,
): Effect.Effect<void> {
  if (json) {
    return writeLine(JSON.stringify(result));
  }
  return Effect.gen(function* () {
    yield* writeLine(result.output);
    if (result.push) yield* writeLine(formatPushLine(result.push));
  });
}

function emitGitMutation(
  result: NoteGitResult,
  output: string,
  commitMessage: string,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* writeLine(output);
    if (result.commit.ok && result.commit.committed) {
      yield* writeLine(`Committed to git: \`${commitMessage}\``);
    } else if (!result.commit.ok) {
      yield* writeLine(
        `Git commit failed (saved locally): ${result.commit.error ?? "unknown error"}`,
      );
    }
    if (result.push) yield* writeLine(formatPushLine(result.push));
  });
}

function hasTag(entry: NoteEntry, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return entry.tags.some((current) => current.toLowerCase() === wanted);
}

function filterEntries(
  entries: readonly NoteEntry[],
  tag: string | undefined,
): readonly NoteEntry[] {
  return tag ? entries.filter((entry) => hasTag(entry, tag)) : entries;
}

function filterSections(
  sections: readonly NoteRepoSection[],
  tag: string | undefined,
): readonly NoteRepoSection[] {
  if (!tag) return sections;
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => hasTag(entry, tag)),
    }))
    .filter((section) => section.entries.length > 0);
}

function formatHandoffLabel(entry: NoteEntry): string {
  return `[${priorityLabel(notePriority(entry))}] ${formatNoteLabel(entry)}`;
}

function sortHandoffs(entries: readonly NoteEntry[]): readonly NoteEntry[] {
  return [...entries].sort((a, b) => {
    const rankDelta =
      priorityRank(notePriority(a)) - priorityRank(notePriority(b));
    return rankDelta !== 0 ? rankDelta : b.mtime - a.mtime;
  });
}

const allNotesFilter = {
  includeAllRepos: true,
} satisfies NotesViewFilter;

const handoffNotesFilter = {
  tag: "handoff",
  title: "Handoffs",
} satisfies NotesViewFilter;

function includeAllRepos(filter: NotesViewFilter): NotesViewFilter {
  return { ...filter, includeAllRepos: true };
}

function guardInteractiveTui(mode: TuiMode): void {
  if (process.stdout.isTTY) return;
  const filter = mode.initialNotesFilter;
  const alternative =
    filter?.tag === "handoff"
      ? `notes handoffs --list${filter.includeAllRepos ? " --all" : ""}`
      : `notes list${filter?.includeAllRepos ? " --all" : ""}`;
  console.error(
    "notes: not opening the interactive TUI (stdout is not an interactive terminal).",
  );
  console.error(`Run \`${alternative}\` for machine-readable output.`);
  process.exit(1);
}

function formatHandoffSections(sections: readonly NoteRepoSection[]): string {
  return sections
    .map((section) =>
      [
        `## ${section.repoSlug}`,
        ...sortHandoffs(section.entries).map(formatHandoffLabel),
      ].join("\n"),
    )
    .join("\n\n");
}

function runRoot({ projects }: { readonly projects: boolean }) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const root = projects ? yield* notes.projectsRoot : yield* notes.root;
      yield* writeLine(root);
    }),
  );
}

function runContext({
  command,
  json,
}: {
  readonly command: string;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      if (json) {
        const payload = yield* notes.contextPayload({ command });
        yield* writeLine(JSON.stringify(payload, null, 2));
        return;
      }
      yield* writeLine(yield* notes.context({ command }));
    }),
  );
}

function runList({
  all,
  tag,
  format,
}: {
  readonly all: boolean;
  readonly tag: string | undefined;
  readonly format: NotesListFormat;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      if (all) {
        const sections = filterSections(yield* notes.listAll(), tag);
        const output =
          format === "json"
            ? JSON.stringify(sections, null, 2)
            : formatNoteSections(sections);
        yield* writeLine(output);
        return;
      }

      const entries = filterEntries(yield* notes.list(), tag);
      const output =
        format === "json"
          ? JSON.stringify(entries, null, 2)
          : entries.map(formatNoteLabel).join("\n");
      yield* writeLine(output);
    }),
  );
}

function runSearch({
  query,
  all,
  tag,
  format,
}: {
  readonly query: string;
  readonly all: boolean;
  readonly tag: string | undefined;
  readonly format: NotesListFormat;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const entries = all
        ? (yield* notes.listAll()).flatMap((section) => section.entries)
        : yield* notes.list();
      const results = searchNoteEntries(filterEntries(entries, tag), query);
      yield* writeLine(
        format === "json"
          ? JSON.stringify(results, null, 2)
          : results.map(formatNoteLabel).join("\n"),
      );
    }),
  );
}

function runRead({
  path,
  json,
}: {
  readonly path: string;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.read(path);
      yield* json
        ? writeLine(JSON.stringify(result))
        : writeText(result.content);
    }),
  );
}

function runWrite({
  path,
  expectedHash,
  json,
}: {
  readonly path: string;
  readonly expectedHash: string | undefined;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const content = yield* Effect.promise(() => Bun.stdin.text());
      const result = yield* notes.write(path, content, { expectedHash });
      yield* emitNoteResult(result, json);
    }),
  );
}

function runDelete({
  path,
  json,
}: {
  readonly path: string;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.delete(path);
      yield* emitNoteResult(result, json);
    }),
  );
}

function runMove({
  path,
  to,
  json,
}: {
  readonly path: string;
  readonly to: string;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.move(path, to);
      yield* emitNoteResult(result, json);
    }),
  );
}

function runCreate({
  repository,
  kind,
  name,
  description,
  json,
}: {
  readonly repository: string;
  readonly kind: "note" | "handoff";
  readonly name: string;
  readonly description: string;
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.createFromInput(
        repository,
        kind,
        name,
        description,
        yield* Effect.promise(() => Bun.stdin.text()),
      );
      if (json) {
        yield* writeLine(JSON.stringify(result));
      } else {
        yield* emitGitMutation(
          result.git,
          `Created: ${result.draft.entry.filePath}`,
          `notes: create ${result.draft.entry.filename}`,
        );
      }
    }),
  );
}

function runTargets({ format }: { readonly format: NotesListFormat }) {
  return handleNotesError(
    Effect.gen(function* () {
      const targets = yield* (yield* Notes).moveTargets();
      yield* writeLine(
        format === "json"
          ? JSON.stringify(targets, null, 2)
          : targets.join("\n"),
      );
    }),
  );
}

function runAgents({ format }: { readonly format: NotesListFormat }) {
  return Effect.gen(function* () {
    const executor = yield* CommandExecutor;
    const agents = yield* Effect.tryPromise({
      try: () => detectAgentTargets(commandRunner(executor)),
      catch: (error) =>
        new NotesError({
          message: `Failed to detect agents: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
    yield* writeLine(
      format === "json"
        ? JSON.stringify(agents, null, 2)
        : agents.map((agent) => `${agent.command} - ${agent.label}`).join("\n"),
    );
  }).pipe(handleNotesError);
}

function runPriority({
  path,
  value,
  json,
}: {
  readonly path: string;
  readonly value: "low" | "medium" | "high" | "critical";
  readonly json: boolean;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const result = yield* (yield* Notes).setPriority(path, value);
      if (json) {
        yield* writeLine(JSON.stringify({ path, priority: value, ...result }));
      } else {
        yield* emitGitMutation(
          result,
          `Priority set to ${value}: ${path}`,
          `notes: set priority ${basename(path)}`,
        );
      }
    }),
  );
}

function runOpenAgent({
  path,
  agent,
}: {
  readonly path: string;
  readonly agent: string;
}) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const executor = yield* CommandExecutor;
      const runner = commandRunner(executor);
      const target = (yield* Effect.tryPromise({
        try: () => detectAgentTargets(runner),
        catch: (error) =>
          new NotesError({
            message: `Failed to detect agent targets: ${error instanceof Error ? error.message : String(error)}`,
          }),
      })).find((candidate) => candidate.command === agent);
      if (!target)
        return yield* new NotesError({
          message: `Agent target is not installed: ${agent}`,
        });
      const note = yield* notes.resolveEntry(path);
      const result = yield* Effect.tryPromise({
        try: () => openNoteAgent(runner, note.entry, note.content, target),
        catch: (error) =>
          new NotesError({
            message: `Failed to open note agent: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });
      yield* writeLine(JSON.stringify(result));
    }),
  );
}

function commandRunner(executor: CommandExecutorService): AgentCommandRunner {
  return {
    run: (command, args, options) =>
      Effect.runPromise(executor.run(command, args, options)),
  };
}

function runHandoffs({
  all,
  list,
  format,
}: {
  readonly all: boolean;
  readonly list: boolean;
  readonly format: NotesListFormat;
}) {
  if (!list) {
    return Effect.promise(() =>
      runTui({
        initialNotesFilter: all
          ? includeAllRepos(handoffNotesFilter)
          : handoffNotesFilter,
      }),
    );
  }
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      if (all) {
        const sections = filterSections(yield* notes.listAll(), "handoff");
        const output =
          format === "json"
            ? JSON.stringify(sections, null, 2)
            : formatHandoffSections(sections);
        yield* writeLine(output || "No handoff notes found.");
        return;
      }
      const entries = sortHandoffs((yield* notes.list()).filter(isHandoff));
      const output =
        format === "json"
          ? JSON.stringify(entries, null, 2)
          : entries.map(formatHandoffLabel).join("\n");
      yield* writeLine(output || "No handoff notes found.");
    }),
  );
}

async function runTui(mode: TuiMode): Promise<void> {
  guardInteractiveTui(mode);

  const { extractNativeLibIfNeeded } =
    await import("./lib/extractNativeLib.js");
  const nativeLibPath = await extractNativeLibIfNeeded();
  const { Renderer } = await import("./services/Renderer.js");
  const { loadTheme } = await import("./theme.js");
  const { App } = await import("./notes/tui/App.js");
  const { openNoteInEditor } = await import("./notes/tui/NoteEditor.js");

  const theme = Effect.runSync(loadTheme);
  const TuiLayers = Renderer.layer(theme, nativeLibPath).pipe(
    Layer.provideMerge(Notes.layer),
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(Config.layer),
  );

  const tuiProgram = Effect.gen(function* () {
    const notes = yield* Notes;
    const executor = yield* CommandExecutor;
    const renderer = yield* Renderer;
    const services = yield* Effect.context<never>();
    const runPromise = Effect.runPromiseWith(services);

    new App(
      {
        renderer,
        theme,
        loadTuiScope: () => runPromise(notes.tuiScope()),
        listAllNotes: () => runPromise(notes.listAll()),
        readNote: (filePath) =>
          runPromise(notes.read(filePath)).then((result) => result.content),
        deleteNote: (filePath) => runPromise(notes.delete(filePath)),
        listMoveTargets: () => runPromise(notes.moveTargets()),
        moveNote: (filePath, repoSlug) =>
          runPromise(notes.move(filePath, repoSlug)),
        createNote: (kind, name, description, editorKind) =>
          runPromise(
            notes.create(kind, name, description, (entry) =>
              openNoteInEditor(renderer, entry, editorKind, () => {
                process.stdout.write(`\x1b]0;Notes TUI\x07`);
              }),
            ),
          ),
        editNote: (entry, kind, create) =>
          runPromise(
            notes.edit(
              entry.filePath,
              (currentEntry) =>
                openNoteInEditor(renderer, currentEntry, kind, () => {
                  process.stdout.write(`\x1b]0;Notes TUI\x07`);
                }),
              create,
            ),
          ),
        listAgentTargets: () => detectAgentTargets(commandRunner(executor)),
        openAgent: (entry, noteContent, target, mode) =>
          openNoteAgent(commandRunner(executor), entry, noteContent, target, {
            mode,
          }).then(() => undefined),
        updateNotePriority: (filePath, priority) =>
          runPromise(notes.setPriority(filePath, priority)),
      },
      { initialNotesFilter: mode.initialNotesFilter },
    );

    renderer.start();
    return yield* Effect.callback<void>((resume) => {
      renderer.once("destroy", () => resume(Effect.void));
    });
  });

  await Effect.runPromise(
    tuiProgram.pipe(Effect.scoped, Effect.provide(TuiLayers)),
  );
}

const describedFlag = <A>(flag: Flag.Flag<A>, description: string) =>
  flag.pipe(Flag.withDescription(description));
const optionalString = (name: string, description: string) =>
  describedFlag(Flag.string(name), description).pipe(
    Flag.withDefault(undefined),
  );
const booleanFlag = (name: string, description: string) =>
  describedFlag(Flag.boolean(name), description);
const requiredBooleanFlag = (name: string, description: string) =>
  booleanFlag(name, description).pipe(
    Flag.mapEffect((enabled) =>
      enabled
        ? Effect.succeed(true)
        : new CliError.MissingOption({ option: name }),
    ),
  );
const pathFlag = () =>
  describedFlag(
    Flag.path("path"),
    "Absolute path to a note file inside the notes vault",
  );
const formatFlag = (required = false) => {
  const flag = describedFlag(
    Flag.choice("format", ["labels", "json"] as const),
    "Output format",
  );
  return required ? flag : flag.pipe(Flag.withDefault("labels" as const));
};
const examples = (...commands: readonly string[]) =>
  Command.withExamples(commands.map((command) => ({ command })));

const rootCommand = Command.make(
  "root",
  { projects: booleanFlag("projects", "Print the projects directory") },
  runRoot,
).pipe(
  Command.withDescription("Print the notes vault root"),
  examples("notes root", "notes root --projects"),
);

const contextCommand = Command.make(
  "context",
  {
    command: describedFlag(
      Flag.string("command"),
      "Integration command name requesting context",
    ),
    json: booleanFlag("json", "Emit structured context JSON"),
  },
  runContext,
).pipe(
  Command.withDescription(
    "Resolve project-note context for integration plugins.",
  ),
  examples(
    "notes context --command notes-list",
    "notes context --command note-reference --json",
  ),
);

const listCommand = Command.make(
  "list",
  {
    all: booleanFlag("all", "Show notes from every projects directory"),
    tag: optionalString("tag", "Only include notes with this tag"),
    format: formatFlag(),
  },
  runList,
).pipe(
  Command.withDescription("List repository notes"),
  examples("notes list", "notes list --all", "notes list --tag handoff"),
);

const searchCommand = Command.make(
  "search",
  {
    query: describedFlag(Flag.string("query"), "Fuzzy search text"),
    all: booleanFlag("all", "Show notes from every projects directory"),
    tag: optionalString("tag", "Only include notes with this tag"),
    format: formatFlag(true),
  },
  runSearch,
).pipe(
  Command.withDescription("Search repository note metadata"),
  examples("notes search --query architecture --format labels"),
);

const readCommand = Command.make(
  "read",
  {
    path: pathFlag(),
    json: booleanFlag("json", "Emit content and revision hash as JSON"),
  },
  runRead,
).pipe(Command.withDescription("Print a note file"));

const expectedHashFlag = describedFlag(
  Flag.string("expected-hash"),
  "Fail if the existing note no longer has this SHA-256 hash",
).pipe(
  Flag.mapTryCatch(
    (value) => {
      if (!/^[0-9a-f]{64}$/.test(value)) {
        throw new Error("must be a lowercase SHA-256 hash");
      }
      return value;
    },
    () => "Expected a lowercase SHA-256 hash",
  ),
  Flag.withDefault(undefined),
);

const writeCommand = Command.make(
  "write",
  {
    path: pathFlag(),
    stdin: requiredBooleanFlag("stdin", "Read note content from stdin"),
    expectedHash: expectedHashFlag,
    json: booleanFlag("json", "Emit the complete mutation result as JSON"),
  },
  runWrite,
).pipe(
  Command.withDescription(
    "Write stdin to a note file, then commit and push it",
  ),
);

const deleteCommand = Command.make(
  "delete",
  {
    path: pathFlag(),
    json: booleanFlag("json", "Emit the complete mutation result as JSON"),
  },
  runDelete,
).pipe(Command.withDescription("Delete a note file, then commit and push it"));

const moveCommand = Command.make(
  "move",
  {
    path: pathFlag(),
    to: describedFlag(
      Flag.string("to"),
      "Existing or remembered repository scope",
    ),
    json: booleanFlag("json", "Emit the complete mutation result as JSON"),
  },
  runMove,
).pipe(
  Command.withDescription("Move a note to another known repository scope"),
);

const createCommand = Command.make(
  "create",
  {
    repository: describedFlag(
      Flag.string("repository"),
      "Repository scope for the new note",
    ),
    kind: describedFlag(
      Flag.choice("kind", ["note", "handoff"] as const),
      "Note template kind",
    ),
    name: describedFlag(Flag.string("name"), "Note name"),
    description: describedFlag(Flag.string("description"), "Note description"),
    stdin: requiredBooleanFlag("stdin", "Read the note body from stdin"),
    json: booleanFlag("json", "Emit the complete create result as JSON"),
  },
  runCreate,
).pipe(
  Command.withDescription("Create a note from stdin, then commit and push it"),
);

const targetsCommand = Command.make(
  "targets",
  { format: formatFlag(true) },
  runTargets,
).pipe(Command.withDescription("List known repository targets"));

const agentsCommand = Command.make(
  "agents",
  { format: formatFlag(true) },
  runAgents,
).pipe(Command.withDescription("List installed agent targets"));

const priorityCommand = Command.make(
  "priority",
  {
    path: pathFlag(),
    value: describedFlag(
      Flag.choice("value", ["low", "medium", "high", "critical"] as const),
      "New priority",
    ),
    json: booleanFlag("json", "Emit the mutation result as JSON"),
  },
  runPriority,
).pipe(Command.withDescription("Set a note priority, then commit and push it"));

const openAgentCommand = Command.make(
  "open-agent",
  {
    path: pathFlag(),
    agent: describedFlag(Flag.string("agent"), "Command from notes agents"),
    json: requiredBooleanFlag("json", "Emit the opened workspace and tab IDs"),
  },
  runOpenAgent,
).pipe(
  Command.withDescription("Open a note in an installed agent through Herdr"),
);

const handoffsCommand = Command.make(
  "handoffs",
  {
    all: booleanFlag("all", "Show notes from every projects directory"),
    list: booleanFlag(
      "list",
      "List handoffs to stdout instead of opening the TUI",
    ),
    format: formatFlag(),
  },
  runHandoffs,
).pipe(
  Command.withAlias("handoff"),
  Command.withDescription("Browse handoff-tagged notes"),
);

const mcpCommand = Command.make("mcp", {}, () =>
  Effect.promise(() => import("./mcp/commands/Mcp.js")).pipe(
    Effect.flatMap(({ mcpServer }) => mcpServer),
    Effect.catchCauseIf(Cause.hasInterruptsOnly, () => Effect.void),
  ),
).pipe(Command.withDescription("Run the notes MCP server over stdio"));

const daemonCommand = Command.make(
  "daemon",
  {
    config: describedFlag(
      Flag.path("config"),
      "Daemon YAML configuration path",
    ),
    once: booleanFlag("once", "Process one queue snapshot and exit"),
  },
  ({ config, once }) => runDaemon(config, once),
).pipe(
  Command.withDescription("Process captured notes through local OpenCode"),
);

const captureCommand = Command.make(
  "capture",
  {
    config: describedFlag(
      Flag.path("config"),
      "Daemon YAML configuration path",
    ),
    status: booleanFlag("status", "Check local processor availability"),
    stdin: booleanFlag("stdin", "Read captured note text from stdin"),
    repository: optionalString(
      "repository",
      "Target repository (omit for Automatic)",
    ),
    json: booleanFlag("json", "Emit a machine-readable result"),
  },
  ({ config, status, stdin, repository, json }) =>
    Effect.gen(function* () {
      if (status === stdin) {
        return yield* new UsageError({
          message: "notes capture requires exactly one of --status or --stdin",
        });
      }
      if (status && repository !== undefined) {
        return yield* new UsageError({
          message: "notes capture --status does not accept --repository",
        });
      }
      if (status) {
        const result = yield* captureStatus(config);
        yield* writeLine(
          json ? JSON.stringify(result) : "Local capture is available",
        );
        return;
      }
      const text = yield* Effect.promise(() => Bun.stdin.text());
      const result = yield* processLocalCapture(config, {
        version: 1,
        requestId: crypto.randomUUID(),
        text,
        capturedAt: new Date().toISOString(),
        source: "text",
        repository,
      });
      yield* writeLine(json ? JSON.stringify(result) : result.summary);
    }),
).pipe(
  Command.withDescription("Process a captured note through local OpenCode"),
);

export const notesCommand = Command.make(
  "notes",
  { all: booleanFlag("all", "Browse notes from every projects directory") },
  ({ all }) =>
    Effect.promise(() =>
      runTui({ initialNotesFilter: all ? allNotesFilter : undefined }),
    ),
).pipe(
  Command.withDescription(
    "Standalone TUI, CLI, and MCP server for repo-scoped Markdown notes.",
  ),
  Command.withSubcommands([
    rootCommand,
    contextCommand,
    listCommand,
    searchCommand,
    readCommand,
    writeCommand,
    deleteCommand,
    moveCommand,
    createCommand,
    targetsCommand,
    agentsCommand,
    priorityCommand,
    openAgentCommand,
    handoffsCommand,
    mcpCommand,
    captureCommand,
    daemonCommand,
  ]),
);

export function runCli(args: readonly string[]) {
  return Command.runWith(notesCommand, { version: "0.1.0" })(args);
}

const CliLayers = Notes.layer.pipe(
  Layer.provideMerge(CommandExecutor.layer),
  Layer.provideMerge(Config.layer),
);
export const MainLayer = Layer.merge(CliLayers, NodeServices.layer);

setHelpRenderer((commandName) => {
  const lines: string[] = [];
  const output: Console.Console = Object.assign(Object.create(console), {
    log: (...values: readonly unknown[]) => lines.push(values.join(" ")),
    error: (...values: readonly unknown[]) => lines.push(values.join(" ")),
  });
  return runCli(commandName ? [commandName, "--help"] : ["--help"]).pipe(
    Effect.provideService(Console.Console, output),
    Effect.provide(MainLayer),
    Effect.orDie,
    Effect.map(() => lines.join("\n")),
  );
});

if (import.meta.main) {
  const initialCommand = invokedCommand();
  const cliArgs = initialCommand
    ? [initialCommand, ...process.argv.slice(2)]
    : process.argv.slice(2);
  NodeRuntime.runMain(runCli(cliArgs).pipe(Effect.provide(MainLayer)));
}
