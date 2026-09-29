import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  Clock,
  Duration,
  Effect,
  FileSystem,
  Option,
  Schedule,
  Schema,
} from "effect";
import { HerdrSdk, type PaneId, type TabId } from "@timmo001/effect-herdr";
import { CommandExecutor } from "../services/CommandExecutor.js";
import type { NoteEntry } from "./types.js";

export interface AgentTarget {
  readonly command: string;
  readonly executable: string;
  readonly label: string;
}

export type AgentOpenMode = "default" | "plan";

export type ExecutableCheck = (
  path: string,
) => Effect.Effect<boolean, never, FileSystem.FileSystem>;

export interface OpenAgentOptions {
  readonly mode?: AgentOpenMode;
  readonly executableAvailable?: ExecutableCheck;
}

export interface OpenAgentResult {
  readonly note: string;
  readonly agent: AgentTarget;
  readonly workspaceId: string;
  readonly tabId: string;
  readonly paneId: string;
}

class AgentOpenError extends Schema.TaggedError<AgentOpenError>()(
  "AgentOpenError",
  { message: Schema.String },
) {}

const OPENCODE2 = "/home/aidan/.local/bin/opencode2";

const RepositoryPicker = Schema.Array(
  Schema.Struct({ name: Schema.String, path: Schema.String }),
);

const TARGETS: readonly AgentTarget[] = [
  { command: "opencode2", executable: OPENCODE2, label: "OpenCode 2" },
  { command: "pi", executable: "pi", label: "Pi" },
  { command: "cursor", executable: "cursor-agent", label: "Cursor Agent" },
  { command: "claude", executable: "claude", label: "Claude Code" },
  { command: "codex", executable: "codex", label: "Codex" },
  { command: "copilot", executable: "copilot", label: "GitHub Copilot" },
  { command: "omp", executable: "omp", label: "OMP" },
  { command: "devin", executable: "devin", label: "Devin" },
  { command: "droid", executable: "droid", label: "Droid" },
  { command: "kimi", executable: "kimi", label: "Kimi" },
  { command: "kilo", executable: "kilo", label: "Kilo" },
  { command: "hermes", executable: "hermes", label: "Hermes" },
  { command: "qodercli", executable: "qodercli", label: "Qoder CLI" },
  { command: "qwen", executable: "qwen", label: "Qwen" },
  { command: "mastracode", executable: "mastracode", label: "Mastra Code" },
  {
    command: "antigravity-cli",
    executable: "antigravity-cli",
    label: "Antigravity CLI",
  },
  { command: "grok", executable: "grok", label: "Grok" },
];

/** Resolve installed Herdr integrations in the timmo.git picker order. */
export const detectAgentTargets = Effect.fn("detectAgentTargets")(function* (
  executableAvailable: ExecutableCheck = isRegularExecutable,
) {
  const sdk = yield* HerdrSdk;
  const integrations = yield* sdk.integrations.list();

  const installed = new Set<string>(
    integrations
      .filter(({ state }) => state === "current" || state === "outdated")
      .map(({ target }) => target),
  );

  const opencode2Available = yield* executableAvailable(OPENCODE2);

  return TARGETS.filter((target) =>
    target.command === "opencode2"
      ? opencode2Available
      : installed.has(target.command),
  );
});

/** Open a note in a ready agent running in a focused Herdr tab. */
export const openNoteAgent = Effect.fn("openNoteAgent")(function* (
  entry: NoteEntry,
  content: string,
  target: AgentTarget,
  options: OpenAgentOptions = {},
) {
  const mode = options.mode ?? "default";

  const executableAvailable =
    options.executableAvailable ?? isRegularExecutable;

  if (
    target.command === "opencode2" &&
    !(yield* executableAvailable(target.executable))
  ) {
    return yield* new AgentOpenError({
      message: `${target.executable} is not a regular executable file`,
    });
  }

  const cwd = entry.projectDir ?? homedir();
  const workspaceLabel = yield* workspaceLabelForDirectory(cwd);
  const sdk = yield* HerdrSdk;
  const listed = yield* sdk.workspaces.list();

  let workspaceId = listed.find(
    (workspace) =>
      workspace.label.toLowerCase() === workspaceLabel.toLowerCase(),
  )?.id;

  let tabId: TabId;
  let paneId: PaneId;

  if (!workspaceId) {
    const created = yield* sdk.workspaces.createInDirectory(cwd, {
      label: workspaceLabel,
      focus: false,
    });

    workspaceId = created.workspace.id;
    tabId = created.tab.id;
    paneId = created.rootPane.id;
    yield* sdk.tabs.rename(tabId, target.label);
  } else {
    const created = yield* sdk.tabs.create({
      workspaceId,
      cwd,
      label: target.label,
      focus: false,
    });

    tabId = created.tab.id;
    paneId = created.rootPane.id;
  }

  const expectedOpenCode2 =
    target.command === "opencode2"
      ? (yield* (yield* CommandExecutor).run("mise", [
          "which",
          "opencode2",
        ])).trim()
      : null;

  yield* sdk.panes.sendInput(paneId, {
    text: target.executable,
    keys: ["enter"],
  });
  yield* sdk.workspaces.focus(workspaceId);
  yield* sdk.tabs.focus(tabId);
  const deadline = (yield* Clock.currentTimeMillis) + 30_000;
  yield* sdk.agents.get({ paneId }).pipe(
    Effect.retry({
      schedule: Schedule.spaced("100 millis"),
      while: () =>
        Clock.currentTimeMillis.pipe(Effect.map((now) => now < deadline)),
    }),
  );
  yield* sdk.agents.wait(
    { paneId },
    { timeoutMs: 30_000 },
    { requestTimeout: Duration.seconds(35) },
  );

  if (expectedOpenCode2) {
    const processInfo = yield* sdk.panes.processInfo(paneId);

    if (
      !processInfo.foregroundProcesses?.some((process) =>
        Option.exists(process.argv, (argv) => argv.includes(expectedOpenCode2)),
      )
    ) {
      return yield* new AgentOpenError({
        message: "OpenCode 2 did not start through the expected runtime",
      });
    }
  }

  yield* sdk.agents.prompt(
    { paneId },
    {
      text: noteAgentPrompt(entry, content, mode),
      wait: { timeoutMs: 120_000 },
    },
    { requestTimeout: Duration.seconds(125) },
  );

  return {
    note: entry.filePath,
    agent: target,
    workspaceId,
    tabId,
    paneId,
  } satisfies OpenAgentResult;
});

export function workspaceLabelForDirectory(
  directory: string,
  pickerCache = join(
    process.env.XDG_CACHE_HOME || join(homedir(), ".cache"),
    "dot",
    "repo-picker.json",
  ),
) {
  const fallback = basename(directory);

  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(pickerCache);
    const value = yield* Effect.try(() => JSON.parse(text));

    const repositories =
      yield* Schema.decodeUnknownEffect(RepositoryPicker)(value);

    return (
      repositories.find((repository) => repository.path === directory)?.name ??
      fallback
    );
  }).pipe(Effect.orElseSucceed(() => fallback));
}

/** Check that a path resolves to a regular file the current user can execute. */
export const isRegularExecutable: ExecutableCheck = Effect.fn(
  "isRegularExecutable",
)(
  function* (path: string) {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.stat(path);

    if (info.type !== "File") return false;

    const uid = process.getuid?.();
    const uidMatches = Option.exists(info.uid, (owner) => owner === uid);

    const groups = new Set([
      process.getgid?.(),
      ...(process.getgroups?.() ?? []),
    ]);

    const gidMatches = Option.exists(info.gid, (group) => groups.has(group));

    if (uid === 0) return (info.mode & 0o111) !== 0;

    return (
      (info.mode & (uidMatches ? 0o100 : gidMatches ? 0o010 : 0o001)) !== 0
    );
  },
  Effect.orElseSucceed(() => false),
);

export function noteAgentPrompt(
  entry: NoteEntry,
  content: string,
  mode: AgentOpenMode = "default",
): string {
  return [
    ...(mode === "plan"
      ? [
          "Create an implementation-ready plan for the loaded note below. Inspect the relevant implementation and tests before planning, resolve repository facts with read-only tools, and include concrete locations, change mechanics, verification, and a Files tree.",
          "Present the plan directly without making implementation changes.",
          "Inspect the note for explicit skill names or clearly required workflows, and load each relevant skill before planning.",
          "",
        ]
      : []),
    `Use the repository note ${entry.filename} included below as full context for this session.`,
    `The note file path is ${entry.filePath}.`,
    entry.repoSlug ? `Repository: ${entry.repoSlug}` : "",
    entry.name ? `Name: ${entry.name}` : "",
    entry.description ? `Description: ${entry.description}` : "",
    entry.tags.length ? `Tags: ${entry.tags.join(", ")}` : "",
    "",
    `----- BEGIN LOADED NOTE: ${entry.filename} -----`,
    content || "(empty note)",
    `----- END LOADED NOTE: ${entry.filename} -----`,
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
}
