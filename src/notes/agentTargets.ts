import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { Schema } from "effect";
import type { NoteEntry } from "./types.js";

export interface AgentTarget {
  readonly command: string;
  readonly executable: string;
  readonly label: string;
}

export interface OpenAgentResult {
  readonly note: string;
  readonly agent: AgentTarget;
  readonly workspaceId: string;
  readonly tabId: string;
  readonly paneId: string;
}

export interface AgentCommandRunner {
  readonly run: (
    command: string,
    args: readonly string[],
    options?: { readonly cwd?: string },
  ) => Promise<string>;
}

const OPENCODE2 = "/home/aidan/.local/bin/opencode2";
const WorkspaceListResponse = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({
      workspaces: Schema.Array(
        Schema.Struct({ workspace_id: Schema.String, label: Schema.String }),
      ),
    }),
  }),
);
const WorkspaceCreateResponse = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({
      workspace: Schema.Struct({ workspace_id: Schema.String }),
      tab: Schema.Struct({ tab_id: Schema.String }),
      root_pane: Schema.Struct({ pane_id: Schema.String }),
    }),
  }),
);
const TabCreateResponse = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({
      tab: Schema.Struct({ tab_id: Schema.String }),
      root_pane: Schema.Struct({ pane_id: Schema.String }),
    }),
  }),
);
const TARGETS: readonly AgentTarget[] = [
  { command: "opencode2", executable: OPENCODE2, label: "OpenCode 2" },
  { command: "opencode", executable: "opencode", label: "OpenCode 1" },
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
export async function detectAgentTargets(
  runner: AgentCommandRunner,
  executableAvailable: (path: string) => boolean = isRegularExecutable,
): Promise<readonly AgentTarget[]> {
  const status = await runner.run("herdr", ["integration", "status"]);
  const installed = new Set(
    status.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([^:]+): (?:current|outdated)(?:\s|$)/);
      return match?.[1] ? [match[1]] : [];
    }),
  );
  return TARGETS.filter((target) =>
    target.command === "opencode2"
      ? installed.has("opencode") && executableAvailable(OPENCODE2)
      : installed.has(target.command),
  );
}

/** Open a note in a ready agent running in a focused Herdr tab. */
export async function openNoteAgent(
  runner: AgentCommandRunner,
  entry: NoteEntry,
  content: string,
  target: AgentTarget,
  executableAvailable: (path: string) => boolean = isRegularExecutable,
): Promise<OpenAgentResult> {
  if (
    target.command === "opencode2" &&
    !executableAvailable(target.executable)
  ) {
    throw new Error(`${target.executable} is not a regular executable file`);
  }
  const cwd = entry.projectDir ?? homedir();
  const workspaceLabel = basename(cwd);
  const listed = Schema.decodeSync(WorkspaceListResponse)(
    await runner.run("herdr", ["workspace", "list"]),
  );
  let workspaceId = listed.result.workspaces.find(
    (workspace) =>
      workspace.label.toLowerCase() === workspaceLabel.toLowerCase(),
  )?.workspace_id;
  let tabId: string;
  let paneId: string;

  if (!workspaceId) {
    const created = Schema.decodeSync(WorkspaceCreateResponse)(
      await runner.run("herdr", [
        "workspace",
        "create",
        "--cwd",
        cwd,
        "--label",
        workspaceLabel,
        "--no-focus",
      ]),
    );
    workspaceId = created.result.workspace.workspace_id;
    tabId = created.result.tab.tab_id;
    paneId = created.result.root_pane.pane_id;
    await runner.run("herdr", ["tab", "rename", tabId, target.label]);
  } else {
    const created = Schema.decodeSync(TabCreateResponse)(
      await runner.run("herdr", [
        "tab",
        "create",
        "--workspace",
        workspaceId,
        "--cwd",
        cwd,
        "--label",
        target.label,
        "--no-focus",
      ]),
    );
    tabId = created.result.tab.tab_id;
    paneId = created.result.root_pane.pane_id;
  }

  const expectedOpenCode2 =
    target.command === "opencode2"
      ? (await runner.run("mise", ["which", "opencode2"])).trim()
      : null;
  await runner.run("herdr", ["pane", "run", paneId, target.executable]);
  await runner.run("herdr", ["workspace", "focus", workspaceId]);
  await runner.run("herdr", ["tab", "focus", tabId]);
  await waitForAgentDetection(runner, paneId);
  await runner.run("herdr", ["agent", "wait", paneId, "--timeout", "30000"]);
  if (expectedOpenCode2) {
    const processInfo = await runner.run("herdr", [
      "pane",
      "process-info",
      "--pane",
      paneId,
    ]);
    if (!processInfo.includes(expectedOpenCode2)) {
      throw new Error("OpenCode 2 did not start through the expected runtime");
    }
  }
  await runner.run("herdr", [
    "agent",
    "prompt",
    paneId,
    noteAgentPrompt(entry, content),
    "--wait",
    "--timeout",
    "120000",
  ]);
  return { note: entry.filePath, agent: target, workspaceId, tabId, paneId };
}

async function waitForAgentDetection(
  runner: AgentCommandRunner,
  paneId: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      await runner.run("herdr", ["agent", "get", paneId]);
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await Bun.sleep(100);
    }
  }
}

/** Check that a path resolves to a regular file the current user can execute. */
export function isRegularExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function noteAgentPrompt(entry: NoteEntry, content: string): string {
  return [
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
