import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Effect } from "effect";
import {
  detectAgentTargets,
  isRegularExecutable,
  noteAgentPrompt,
  openNoteAgent,
  workspaceLabelForDirectory,
} from "../../src/notes/agentTargets.js";
import type { NoteEntry } from "../../src/notes/types.js";
import { CommandExecutor } from "../../src/services/CommandExecutor.js";
import { herdrFixture } from "../support/herdr.js";

const temporaryDirectories: string[] = [];
const fixtures: Awaited<ReturnType<typeof herdrFixture>>[] = [];
const entry: NoteEntry = {
  filename: "work.md",
  filePath: "/vault/projects/example/notes/work.md",
  repoSlug: "example/notes",
  projectDir: "/repos/notes",
  name: "Work",
  description: "Continue work",
  tags: ["handoff"],
  priority: "high",
  mtime: 0,
};
const cursor = {
  command: "cursor",
  executable: "cursor-agent",
  label: "Cursor Agent",
};
const opencode2 = {
  command: "opencode2",
  executable: "/home/aidan/.local/bin/opencode2",
  label: "OpenCode 2",
};
const executor = CommandExecutor.of({
  run: (command, args) => {
    expect([command, ...args]).toEqual(["mise", "which", "opencode2"]);
    return Effect.succeed("/opt/opencode2\n");
  },
  exitCode: () => Effect.die("Unexpected subprocess"),
});

async function fixture(options?: Parameters<typeof herdrFixture>[0]) {
  const server = await herdrFixture(options);
  fixtures.push(server);
  return server;
}

afterEach(async () => {
  for (const server of fixtures.splice(0)) await server.close();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("agent targets", () => {
  test("preserves installed target order, labels and executable overrides", async () => {
    const server = await fixture();
    const targets = await Effect.runPromise(
      detectAgentTargets(() => true).pipe(Effect.provide(server.layer)),
    );
    expect(targets).toEqual([
      opencode2,
      { command: "opencode", executable: "opencode", label: "OpenCode 1" },
      { command: "pi", executable: "pi", label: "Pi" },
      cursor,
      { command: "claude", executable: "claude", label: "Claude Code" },
    ]);
    expect(server.requests.map(({ method }) => method)).toEqual([
      "ping",
      "integration.list",
    ]);
  });

  test("does not advertise OpenCode 2 for a non-executable file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-agent-target-"));
    temporaryDirectories.push(directory);
    const executable = join(directory, "opencode2");
    writeFileSync(executable, "#!/bin/sh\n");
    chmodSync(executable, 0o644);
    const server = await fixture();
    const targets = await Effect.runPromise(
      detectAgentTargets(() => isRegularExecutable(executable)).pipe(
        Effect.provide(server.layer),
      ),
    );
    expect(targets.map(({ command }) => command)).not.toContain("opencode2");
  });

  test("rejects an unavailable wrapper before contacting Herdr", async () => {
    const server = await fixture();
    await expect(
      Effect.runPromise(
        openNoteAgent(entry, "body", opencode2, {
          executableAvailable: () => false,
        }).pipe(
          Effect.provide(server.layer),
          Effect.provideService(CommandExecutor, executor),
        ),
      ),
    ).rejects.toThrow("not a regular executable file");
    expect(server.requests).toEqual([]);
  });

  test("uses an optional repository picker name for the workspace label", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-agent-target-"));
    temporaryDirectories.push(directory);
    const pickerCache = join(directory, "repo-picker.json");
    writeFileSync(
      pickerCache,
      JSON.stringify([{ name: "[HA] Frontend", path: "/repos/frontend" }]),
    );
    expect(
      await Effect.runPromise(
        workspaceLabelForDirectory("/repos/frontend", pickerCache),
      ),
    ).toBe("[HA] Frontend");
    expect(
      await Effect.runPromise(
        workspaceLabelForDirectory("/repos/notes", pickerCache),
      ),
    ).toBe("notes");
    writeFileSync(pickerCache, "invalid");
    expect(
      await Effect.runPromise(
        workspaceLabelForDirectory("/repos/frontend", pickerCache),
      ),
    ).toBe("frontend");
  });

  test("opens an unfocused tab, submits atomically, focuses, waits and prompts", async () => {
    const server = await fixture({
      workspaceLabel: "NOTES",
      detectionFailures: 1,
    });
    const result = await Effect.runPromise(
      openNoteAgent(entry, "# Full body", cursor).pipe(
        Effect.provide(server.layer),
        Effect.provideService(CommandExecutor, executor),
      ),
    );
    expect(result).toMatchObject({
      workspaceId: "w1",
      tabId: "w1:t2",
      paneId: "w1:p2",
    });
    expect(server.requests.map(({ method }) => method)).toEqual([
      "ping",
      "workspace.list",
      "tab.create",
      "pane.send_input",
      "workspace.focus",
      "tab.focus",
      "agent.get",
      "agent.get",
      "agent.wait",
      "agent.prompt",
    ]);
    expect(
      server.requests.find(({ method }) => method === "tab.create")?.params,
    ).toMatchObject({
      workspace_id: "w1",
      cwd: "/repos/notes",
      label: cursor.label,
      focus: false,
    });
    expect(
      server.requests.find(({ method }) => method === "pane.send_input")
        ?.params,
    ).toMatchObject({
      pane_id: "w1:p2",
      text: "cursor-agent",
      keys: ["enter"],
    });
    expect(
      server.requests.find(({ method }) => method === "agent.wait")?.params,
    ).toEqual({ target: "w1:p2", timeout_ms: 30_000 });
    const prompt = server.requests.find(
      ({ method }) => method === "agent.prompt",
    )?.params;
    expect(prompt).toMatchObject({
      target: "w1:p2",
      wait: { timeout_ms: 120_000 },
    });
    expect(prompt?.text).toContain("# Full body");
    expect(prompt?.text).toContain(entry.filePath);
  });

  test("creates and renames a workspace's initial tab for a plan agent", async () => {
    const server = await fixture({ newWorkspace: true });
    await Effect.runPromise(
      openNoteAgent(
        entry,
        "body",
        { command: "opencode", executable: "opencode", label: "OpenCode 1" },
        { mode: "plan" },
      ).pipe(
        Effect.provide(server.layer),
        Effect.provideService(CommandExecutor, executor),
      ),
    );
    expect(
      server.requests.find(({ method }) => method === "workspace.create")
        ?.params,
    ).toMatchObject({ cwd: "/repos/notes", label: "notes", focus: false });
    expect(
      server.requests.find(({ method }) => method === "tab.rename")?.params,
    ).toEqual({ tab_id: "w1:t2", label: "OpenCode 1" });
    expect(
      server.requests.find(({ method }) => method === "pane.send_input")
        ?.params,
    ).toMatchObject({ text: "opencode --agent plan", keys: ["enter"] });
    expect(
      server.requests.find(({ method }) => method === "agent.prompt")?.params
        .text,
    ).toContain("dedicated plan agent");
  });

  test("launches the exact OpenCode 2 wrapper and verifies foreground argv before prompting", async () => {
    const server = await fixture();
    await Effect.runPromise(
      openNoteAgent(entry, "body", opencode2, {
        mode: "plan",
        executableAvailable: () => true,
      }).pipe(
        Effect.provide(server.layer),
        Effect.provideService(CommandExecutor, executor),
      ),
    );
    expect(
      server.requests.find(({ method }) => method === "pane.send_input")
        ?.params,
    ).toMatchObject({ text: opencode2.executable, keys: ["enter"] });
    expect(server.requests.map(({ method }) => method).slice(-2)).toEqual([
      "pane.process_info",
      "agent.prompt",
    ]);
    expect(
      server.requests.find(({ method }) => method === "agent.prompt")?.params
        .text,
    ).toContain("without making implementation changes");
  });

  test("does not prompt when foreground argv is the wrong runtime", async () => {
    const server = await fixture({ runtime: "/opt/opencode2-other" });
    await expect(
      Effect.runPromise(
        openNoteAgent(entry, "body", opencode2, {
          executableAvailable: () => true,
        }).pipe(
          Effect.provide(server.layer),
          Effect.provideService(CommandExecutor, executor),
        ),
      ),
    ).rejects.toThrow("expected runtime");
    expect(
      server.requests.some(({ method }) => method === "agent.prompt"),
    ).toBe(false);
  });

  test("uses home when no source checkout is known", async () => {
    const server = await fixture({ workspaceLabel: basename(homedir()) });
    await Effect.runPromise(
      openNoteAgent({ ...entry, projectDir: undefined }, "body", cursor).pipe(
        Effect.provide(server.layer),
        Effect.provideService(CommandExecutor, executor),
      ),
    );
    expect(
      server.requests.find(({ method }) => method === "tab.create")?.params.cwd,
    ).toBe(homedir());
  });

  test("surfaces readiness errors without submitting a prompt", async () => {
    const server = await fixture({ failMethod: "agent.wait" });
    await expect(
      Effect.runPromise(
        openNoteAgent(entry, "body", cursor).pipe(
          Effect.provide(server.layer),
          Effect.provideService(CommandExecutor, executor),
        ),
      ),
    ).rejects.toThrow("Fixture failure");
    expect(
      server.requests.some(({ method }) => method === "agent.prompt"),
    ).toBe(false);
  });

  test("rejects an unsupported protocol before mutations", async () => {
    const server = await fixture({ protocol: 21 });
    await expect(
      Effect.runPromise(
        openNoteAgent(entry, "body", cursor).pipe(
          Effect.provide(server.layer),
          Effect.provideService(CommandExecutor, executor),
        ),
      ),
    ).rejects.toThrow();
    expect(server.requests.map(({ method }) => method)).toEqual(["ping"]);
  });

  test("includes metadata, content and plan instructions in prompts", () => {
    const prompt = noteAgentPrompt(entry, "body");
    expect(prompt).toContain("Name: Work");
    expect(prompt).toContain("Description: Continue work");
    expect(prompt).toContain("Tags: handoff");
    expect(prompt).toContain("body");
    const plan = noteAgentPrompt(entry, "body", "plan");
    expect(plan).toContain("implementation-ready plan");
    expect(plan).toContain("load each relevant skill");
    expect(plan).not.toContain("dedicated plan agent");
  });
});
