import { Effect, Layer, Schema } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { basename } from "node:path";
import { renderHelp } from "./cli/help.js";
import { getCliCommand, nativeCommandNames } from "./cli/spec.js";
import {
  expectedHashOption,
  hasOption,
  optionValue,
  validateOptions,
} from "./cli/args.js";
import {
  isCompletionShell,
  renderCompletions,
  shellList,
} from "./cli/completions.js";
import { CommandExecutor } from "./services/CommandExecutor.js";
import { Config } from "./services/Config.js";
import { mcpServer, mcpTeardown } from "./mcp/commands/Mcp.js";
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
  type NotePushResult,
  type NoteRepoSection,
  type NotesViewFilter,
  type NotesListFormat,
  type NoteWriteResult,
} from "./notes/types.js";

type ParsedArgs = {
  readonly command: string | undefined;
  readonly rest: readonly string[];
  readonly help: boolean;
};

type TuiMode = {
  readonly initialNotesFilter?: NotesViewFilter;
};

class UsageError extends Schema.TaggedErrorClass<UsageError>()("UsageError", {
  message: Schema.String,
}) {}

function parseArgs(args: readonly string[]): ParsedArgs {
  const [first, ...rest] = args;
  if (!first) return { command: undefined, rest: [], help: false };
  if (first === "--help" || first === "-h") {
    return { command: undefined, rest: [], help: true };
  }
  return {
    command: first,
    rest,
    help: rest.includes("--help") || rest.includes("-h"),
  };
}

function invokedCommand(): string | undefined {
  const name = basename(process.argv[1] ?? "");
  return name === "handoffs" || name === "handoff" ? "handoffs" : undefined;
}

function failUsage(message: string): never {
  console.error(usageMessage(message));
  process.exit(1);
}

function usageMessage(message: string): string {
  return `${message}\nRun 'notes --help' to see available commands.`;
}

function helpCommandArg(args: readonly string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("-"));
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

function parseListFormat(args: readonly string[]): NotesListFormat {
  const format = optionValue(args, "--format") ?? "labels";
  if (format === "labels" || format === "json") return format;
  exitWithError([
    `Unknown --format value: ${format} (expected: labels or json)`,
  ]);
}

function formatPushLine(push: NotePushResult): string {
  return push.ok
    ? `Pushed to remote: ${push.message}`
    : `Push failed (non-fatal): ${push.error ?? "unknown error"}`;
}

function emitNoteResult(
  result: NoteWriteResult | NoteDeleteResult,
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

function isHandoffsTuiInvocation(args: readonly string[]): boolean {
  return args.length === 0 || (args.length === 1 && args[0] === "--all");
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

function runRoot(args: readonly string[]) {
  validateOptions(args, { "--repo-notes": "flag" });
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const root = args.includes("--repo-notes")
        ? yield* notes.repoNotesRoot
        : yield* notes.root;
      yield* writeLine(root);
    }),
  );
}

function runContext(args: readonly string[]) {
  validateOptions(args, { "--command": "value", "--json": "flag" });
  return handleNotesError(
    Effect.gen(function* () {
      const command = optionValue(args, "--command");
      if (!command) {
        return yield* new NotesError({
          message: "notes context requires --command <name>",
        });
      }
      const notes = yield* Notes;
      if (args.includes("--json")) {
        const payload = yield* notes.contextPayload({ command });
        yield* writeLine(JSON.stringify(payload, null, 2));
        return;
      }
      yield* writeLine(yield* notes.context({ command }));
    }),
  );
}

function runList(args: readonly string[]) {
  validateOptions(args, {
    "--all": "flag",
    "--tag": "value",
    "--format": "value",
  });
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const format = parseListFormat(args);
      const tag = optionValue(args, "--tag");
      if (hasOption(args, "--all")) {
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

function requirePath(subcommand: string, args: readonly string[]): string {
  const filePath = optionValue(args, "--path");
  if (!filePath) failUsage(`notes ${subcommand} requires --path <path>`);
  return filePath;
}

function runRead(args: readonly string[]) {
  validateOptions(args, { "--path": "value", "--json": "flag" });
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.read(requirePath("read", args));
      yield* hasOption(args, "--json")
        ? writeLine(JSON.stringify(result))
        : writeText(result.content);
    }),
  );
}

function runWrite(args: readonly string[]) {
  validateOptions(args, {
    "--path": "value",
    "--stdin": "flag",
    "--expected-hash": "value",
    "--json": "flag",
  });
  return handleNotesError(
    Effect.gen(function* () {
      if (!hasOption(args, "--stdin"))
        failUsage("notes write requires --stdin");
      const notes = yield* Notes;
      const content = yield* Effect.promise(() => Bun.stdin.text());
      const result = yield* notes.write(requirePath("write", args), content, {
        expectedHash: expectedHashOption(args),
      });
      yield* emitNoteResult(result, hasOption(args, "--json"));
    }),
  );
}

function runDelete(args: readonly string[]) {
  validateOptions(args, { "--path": "value", "--json": "flag" });
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.delete(requirePath("delete", args));
      yield* emitNoteResult(result, hasOption(args, "--json"));
    }),
  );
}

function runHandoffs(args: readonly string[]) {
  validateOptions(args, {
    "--all": "flag",
    "--list": "flag",
    "--format": "value",
  });
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const format = parseListFormat(args);
      const listArgs = args.filter((arg) => arg !== "--list");
      if (hasOption(listArgs, "--all")) {
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

function runCompletions(args: readonly string[]) {
  const positional = args.filter((arg) => !arg.startsWith("-"));
  if (args.some((arg) => arg.startsWith("-")) || positional.length > 1) {
    failUsage("notes completions accepts at most one shell name");
  }
  const shell = args.find((arg) => !arg.startsWith("-")) ?? "zsh";
  if (!isCompletionShell(shell)) {
    throw new Error(
      `notes completions: unsupported shell '${shell}' (expected: ${shellList()})`,
    );
  }
  return Effect.sync(() => process.stdout.write(renderCompletions(shell)));
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
    const renderer = yield* Renderer;
    const services = yield* Effect.context<never>();
    const runPromise = Effect.runPromiseWith(services);

    new App(
      {
        renderer,
        theme,
        listNotes: () => runPromise(notes.list()),
        listAllNotes: () => runPromise(notes.listAll()),
        readNote: (filePath) =>
          runPromise(notes.read(filePath)).then((result) => result.content),
        deleteNote: (filePath) => runPromise(notes.delete(filePath)),
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

const initialCommand = invokedCommand();
const cliArgs = initialCommand
  ? [initialCommand, ...process.argv.slice(2)]
  : process.argv.slice(2);
const parsed = parseArgs(cliArgs);
const command = parsed.command;

async function runTuiOrExit(mode: TuiMode): Promise<void> {
  try {
    await runTui(mode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (parsed.help && !command) {
  console.log(renderHelp());
  process.exit(0);
}

if (!initialCommand && cliArgs.length === 1 && cliArgs[0] === "--all") {
  await runTuiOrExit({ initialNotesFilter: allNotesFilter });
} else if (!command) {
  await runTuiOrExit({});
} else if (
  (command === "handoffs" || command === "handoff") &&
  !parsed.help &&
  isHandoffsTuiInvocation(parsed.rest)
) {
  await runTuiOrExit({
    initialNotesFilter: parsed.rest.includes("--all")
      ? includeAllRepos(handoffNotesFilter)
      : handoffNotesFilter,
  });
} else {
  runNative(parsed, command);
}

function runNative(parsed: ParsedArgs, command: string): void {
  if (!nativeCommandNames.has(command)) {
    failUsage(`notes: unknown command '${command}'`);
  }

  if (parsed.help && command !== "help") {
    console.log(renderHelp(command));
    process.exit(0);
  }

  const CliLayers = Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(Config.layer),
  );

  if (command === "mcp") {
    try {
      validateOptions(parsed.rest, {});
    } catch (error) {
      failUsage(error instanceof Error ? error.message : String(error));
    }
    NodeRuntime.runMain(mcpServer.pipe(Effect.provide(CliLayers)), {
      teardown: mcpTeardown,
    });
    return;
  }

  const effect = Effect.try({
    try: () => {
      const canonical = getCliCommand(command)?.name ?? command;
      switch (canonical) {
        case "root":
          return runRoot(parsed.rest);
        case "context":
          return runContext(parsed.rest);
        case "list":
          return runList(parsed.rest);
        case "read":
          return runRead(parsed.rest);
        case "write":
          return runWrite(parsed.rest);
        case "delete":
          return runDelete(parsed.rest);
        case "handoffs":
          return runHandoffs(parsed.rest);
        case "completions":
          return runCompletions(parsed.rest);
        case "help":
          if (parsed.rest.some((arg) => arg.startsWith("-"))) {
            failUsage("notes help does not accept options");
          }
          if (parsed.rest.filter((arg) => !arg.startsWith("-")).length > 1) {
            failUsage("notes help accepts at most one command name");
          }
          return Effect.sync(() => {
            console.log(renderHelp(helpCommandArg(parsed.rest)));
          });
        default:
          return Effect.fail(
            new UsageError({
              message: usageMessage(`notes: unknown command '${command}'`),
            }),
          );
      }
    },
    catch: (error) =>
      new UsageError({
        message: usageMessage(
          error instanceof Error ? error.message : String(error),
        ),
      }),
  }).pipe(Effect.flatten);

  Effect.runPromise(effect.pipe(Effect.provide(CliLayers))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
