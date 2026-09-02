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
  type AgentCommandRunner,
} from "../../src/notes/agentTargets.js";
import type { NoteEntry } from "../../src/notes/types.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("agent targets", () => {
  test("preserves timmo.git labels, order, and executable overrides", async () => {
    const runner: AgentCommandRunner = {
      run: async () =>
        "cursor: current\nopencode: current\nclaude: outdated\npi: current\n",
    };

    const targets = await detectAgentTargets(runner, () => true);

    expect(targets).toEqual([
      {
        command: "opencode2",
        executable: "/home/aidan/.local/bin/opencode2",
        label: "OpenCode 2",
      },
      { command: "opencode", executable: "opencode", label: "OpenCode 1" },
      { command: "pi", executable: "pi", label: "Pi" },
      { command: "cursor", executable: "cursor-agent", label: "Cursor Agent" },
      { command: "claude", executable: "claude", label: "Claude Code" },
    ]);
  });

  test("does not advertise OpenCode 2 for a non-executable file", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notes-agent-target-"));
    temporaryDirectories.push(directory);
    const executable = join(directory, "opencode2");
    writeFileSync(executable, "#!/bin/sh\n");
    chmodSync(executable, 0o644);
    const runner: AgentCommandRunner = {
      run: async () => "opencode: current (v10) (/plugin)\n",
    };

    const targets = await detectAgentTargets(runner, () =>
      isRegularExecutable(executable),
    );

    expect(targets.map((target) => target.command)).toEqual(["opencode"]);
  });

  test("rejects an unavailable OpenCode 2 wrapper before Herdr topology", async () => {
    const calls: string[][] = [];
    const runner: AgentCommandRunner = {
      run: async (_command, args) => {
        calls.push([...args]);
        return "{}";
      },
    };
    const entry: NoteEntry = {
      filename: "work.md",
      filePath: "/vault/projects/timmo001/notes/work.md",
      repoSlug: "timmo001/notes",
      projectDir: "/repos/notes",
      name: "Work",
      description: "Continue work",
      tags: [],
      priority: null,
      mtime: 0,
    };

    await expect(
      openNoteAgent(
        runner,
        entry,
        "body",
        {
          command: "opencode2",
          executable: "/home/aidan/.local/bin/opencode2",
          label: "OpenCode 2",
        },
        { executableAvailable: () => false },
      ),
    ).rejects.toThrow("not a regular executable file");
    expect(calls).toEqual([]);
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

  test("opens a tab, waits for the agent, and sends full note context", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    let agentGetAttempts = 0;
    const runner: AgentCommandRunner = {
      run: async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "workspace" && args[1] === "list") {
          return JSON.stringify({
            result: { workspaces: [{ workspace_id: "w1", label: "notes" }] },
          });
        }
        if (args[0] === "tab" && args[1] === "create") {
          return JSON.stringify({
            result: {
              tab: { tab_id: "w1:t2" },
              root_pane: { pane_id: "w1:p2" },
            },
          });
        }
        if (args[0] === "agent" && args[1] === "get") {
          agentGetAttempts++;
          if (agentGetAttempts === 1) throw new Error("agent not detected");
        }
        return "{}";
      },
    };
    const entry: NoteEntry = {
      filename: "work.md",
      filePath: "/vault/projects/timmo001/notes/work.md",
      repoSlug: "timmo001/notes",
      projectDir: "/repos/notes",
      name: "Work",
      description: "Continue work",
      tags: ["handoff"],
      priority: "high",
      mtime: 0,
    };
    const target = {
      command: "cursor",
      executable: "cursor-agent",
      label: "Cursor Agent",
    } as const;

    const result = await openNoteAgent(runner, entry, "# Full body", target);

    expect(result).toMatchObject({
      workspaceId: "w1",
      tabId: "w1:t2",
      paneId: "w1:p2",
    });
    expect(agentGetAttempts).toBe(2);
    expect(calls).toContainEqual({
      command: "herdr",
      args: ["pane", "run", "w1:p2", "cursor-agent"],
    });
    const prompt = calls.find(
      (call) => call.args[0] === "agent" && call.args[1] === "prompt",
    )?.args[3];
    expect(prompt).toContain("# Full body");
    expect(prompt).toContain(entry.filePath);
    expect(
      calls
        .find((call) => call.args[0] === "agent" && call.args[1] === "prompt")
        ?.args.slice(4),
    ).toEqual(["--wait", "--timeout", "120000"]);

    calls.length = 0;
    await openNoteAgent(
      runner,
      entry,
      "# Full body",
      { command: "opencode", executable: "opencode", label: "OpenCode 1" },
      { mode: "plan" },
    );
    expect(calls).toContainEqual({
      command: "herdr",
      args: ["pane", "run", "w1:p2", "opencode", "--agent", "plan"],
    });
    expect(
      calls.find(
        (call) => call.args[0] === "agent" && call.args[1] === "prompt",
      )?.args[3],
    ).toContain("dedicated plan agent");

    calls.length = 0;
    await openNoteAgent(
      runner,
      entry,
      "# Full body",
      {
        command: "opencode2",
        executable: "/home/aidan/.local/bin/opencode2",
        label: "OpenCode 2",
      },
      { mode: "plan", executableAvailable: () => true },
    );
    expect(calls).toContainEqual({
      command: "herdr",
      args: ["pane", "run", "w1:p2", "/home/aidan/.local/bin/opencode2"],
    });
    expect(
      calls.find(
        (call) => call.args[0] === "agent" && call.args[1] === "prompt",
      )?.args[3],
    ).toContain("without making implementation changes");
  });

  test("uses the home directory when no source checkout is known", async () => {
    const calls: { command: string; args: readonly string[] }[] = [];
    const runner: AgentCommandRunner = {
      run: async (command, args) => {
        calls.push({ command, args });
        if (args[0] === "workspace" && args[1] === "list") {
          return JSON.stringify({
            result: {
              workspaces: [{ workspace_id: "w1", label: basename(homedir()) }],
            },
          });
        }
        if (args[0] === "tab" && args[1] === "create") {
          return JSON.stringify({
            result: {
              tab: { tab_id: "w1:t2" },
              root_pane: { pane_id: "w1:p2" },
            },
          });
        }
        return "{}";
      },
    };

    await openNoteAgent(
      runner,
      {
        filename: "work.md",
        filePath: "/vault/projects/example/work.md",
        repoSlug: "example/repo",
        name: "Work",
        description: null,
        tags: [],
        priority: null,
        mtime: 0,
      },
      "body",
      { command: "cursor", executable: "cursor-agent", label: "Cursor Agent" },
    );

    expect(calls).toContainEqual({
      command: "herdr",
      args: [
        "tab",
        "create",
        "--workspace",
        "w1",
        "--cwd",
        homedir(),
        "--label",
        "Cursor Agent",
        "--no-focus",
      ],
    });
  });

  test("includes metadata and content in prompts", () => {
    const prompt = noteAgentPrompt(
      {
        filename: "note.md",
        filePath: "/note.md",
        name: "Note",
        description: "Description",
        tags: ["one"],
        priority: null,
        mtime: 0,
      },
      "body",
    );
    expect(prompt).toContain("Name: Note");
    expect(prompt).toContain("Description: Description");
    expect(prompt).toContain("Tags: one");
    expect(prompt).toContain("body");

    const planPrompt = noteAgentPrompt(
      {
        filename: "note.md",
        filePath: "/note.md",
        name: "Note",
        description: null,
        tags: [],
        priority: null,
        mtime: 0,
      },
      "body",
      "plan",
    );
    expect(planPrompt).toContain("implementation-ready plan");
    expect(planPrompt).toContain("load each relevant skill");
    expect(planPrompt).not.toContain("dedicated plan agent");
  });
});
