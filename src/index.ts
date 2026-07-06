import { Effect, Layer, Schema } from "effect";
import { NodeRuntime } from "@effect/platform-node";
import { renderHelp } from "./cli/help.js";
import { getCliCommand, nativeCommandNames } from "./cli/spec.js";
import { hasOption, optionValue } from "./cli/args.js";
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
  type NotesListFormat,
  type NoteWriteResult,
} from "./notes/types.js";

type ParsedArgs = {
  readonly command: string | undefined;
  readonly rest: readonly string[];
  readonly help: boolean;
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
    return writeLine(
      JSON.stringify({ output: result.output, push: result.push ?? null }),
    );
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
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      yield* writeText(yield* notes.read(requirePath("read", args)));
    }),
  );
}

function runWrite(args: readonly string[]) {
  return handleNotesError(
    Effect.gen(function* () {
      if (!hasOption(args, "--stdin"))
        failUsage("notes write requires --stdin");
      const notes = yield* Notes;
      const content = yield* Effect.promise(() => Bun.stdin.text());
      const result = yield* notes.write(requirePath("write", args), content);
      yield* emitNoteResult(result, hasOption(args, "--json"));
    }),
  );
}

function runDelete(args: readonly string[]) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const result = yield* notes.delete(requirePath("delete", args));
      yield* emitNoteResult(result, hasOption(args, "--json"));
    }),
  );
}

function runHandoffs(args: readonly string[]) {
  return handleNotesError(
    Effect.gen(function* () {
      const notes = yield* Notes;
      const format = parseListFormat(args);
      if (hasOption(args, "--all")) {
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
  const shell = args.find((arg) => !arg.startsWith("-")) ?? "zsh";
  if (!isCompletionShell(shell)) {
    throw new Error(
      `notes completions: unsupported shell '${shell}' (expected: ${shellList()})`,
    );
  }
  return Effect.sync(() => process.stdout.write(renderCompletions(shell)));
}

const parsed = parseArgs(process.argv.slice(2));
const command = parsed.command;

if (parsed.help && !command) {
  console.log(renderHelp());
  process.exit(0);
}

if (!command) {
  console.log(renderHelp());
  process.exit(0);
}

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
  NodeRuntime.runMain(mcpServer.pipe(Effect.provide(CliLayers)), {
    teardown: mcpTeardown,
  });
} else {
  const effect = (() => {
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
  })();

  Effect.runPromise(effect.pipe(Effect.provide(CliLayers))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
