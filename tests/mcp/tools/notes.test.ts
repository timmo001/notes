import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { McpSchema, McpServer } from "effect/unstable/ai";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Notifier } from "../../../src/mcp/services/Notifier.js";
import { registerNotesTools } from "../../../src/mcp/tools/notes.js";
import { renderDraft } from "../../../src/notes/frontmatter.js";
import { Notes } from "../../../src/notes/services/Notes.js";
import { CommandExecutor } from "../../../src/services/CommandExecutor.js";
import { Config } from "../../../src/services/Config.js";

const temporaryDirectories: string[] = [];
const identity = {
  source: "remote" as const,
  owner: "timmo001",
  repo: "notes",
  remote: "origin",
  remoteUrl: "git@github.com:timmo001/notes.git",
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
  getClient: Effect.die("not used in this test"),
});

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "notes-mcp-"));
  temporaryDirectories.push(root);
  git(root, "init");
  git(root, "config", "user.name", "Notes Test");
  git(root, "config", "user.email", "notes@example.invalid");
  const notesPath = join(root, "projects", "timmo001", "notes");
  const path = join(notesPath, "note.md");
  mkdirSync(notesPath, { recursive: true });
  writeFileSync(
    path,
    renderDraft("note", identity, "date", "Note", "Description"),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Initial note");
  return { root, notesPath, path };
}

async function callTool(
  root: string,
  name: string,
  args: Record<string, unknown>,
  notifications: string[] = [],
) {
  const layer = Layer.mergeAll(
    McpServer.McpServer.layer,
    Notes.layer.pipe(
      Layer.provideMerge(CommandExecutor.layer),
      Layer.provideMerge(
        Layer.succeed(Config, { notesDir: root, projectDir: process.cwd() }),
      ),
    ),
    Layer.succeed(Notifier, {
      notify: (title, message) =>
        Effect.sync(() => notifications.push(`${title}: ${message}`)),
    }),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* registerNotesTools;
      return yield* (yield* McpServer.McpServer)
        .callTool({ name, arguments: args })
        .pipe(Effect.provideService(McpSchema.McpServerClient, client));
    }).pipe(Effect.provide(layer)),
  );
}

function resultText(result: Awaited<ReturnType<typeof callTool>>): string {
  return result.content[0]?.type === "text" ? result.content[0].text : "";
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("notes MCP tools", () => {
  test("note_read returns content and a revision hash", async () => {
    const { root, path } = fixture();

    const result = await callTool(root, "note_read", { path });

    expect(result.isError).toBeFalse();
    expect(JSON.parse(resultText(result))).toMatchObject({
      path,
      hash: expect.any(String),
    });
  });

  test("note_list filters tags case-insensitively", async () => {
    const { root, notesPath } = fixture();
    writeFileSync(
      join(notesPath, "handoff.md"),
      renderDraft("handoff", identity, "date", "Handoff", "Next work"),
    );

    const result = await callTool(root, "note_list", { tag: "HANDOFF" });

    expect(result.isError).toBeFalse();
    expect(JSON.parse(resultText(result))).toMatchObject([
      { filename: "handoff.md", tags: ["handoff", "draft"] },
    ]);
  });

  test("note_write updates a guarded note and notifies", async () => {
    const { root, path } = fixture();
    const notifications: string[] = [];
    const read = await callTool(root, "note_read", { path });
    const { content, hash } = JSON.parse(resultText(read)) as {
      content: string;
      hash: string;
    };

    const result = await callTool(
      root,
      "note_write",
      {
        path,
        content: content.replace("# Note", "# Updated"),
        expectedHash: hash,
      },
      notifications,
    );

    expect(result.isError).toBeFalse();
    expect(resultText(result)).toContain(`Written: ${path}`);
    expect(readFileSync(path, "utf8")).toContain("# Updated");
    expect(notifications).toEqual(["notes: written: note.md - saved locally"]);
  });

  test("note_write rejects malformed and stale revision hashes", async () => {
    const { root, path } = fixture();
    const malformed = await callTool(root, "note_write", {
      path,
      content: readFileSync(path, "utf8"),
      expectedHash: "invalid",
    });
    const stale = await callTool(root, "note_write", {
      path,
      content: readFileSync(path, "utf8"),
      expectedHash: "0".repeat(64),
    });

    expect(malformed.isError).toBeTrue();
    expect(resultText(malformed)).toContain("lowercase SHA-256 hash");
    expect(stale.isError).toBeTrue();
    expect(resultText(stale)).toContain("Note changed since it was read");
  });

  test("note_delete removes the note and notifies", async () => {
    const { root, path } = fixture();
    const notifications: string[] = [];

    const result = await callTool(root, "note_delete", { path }, notifications);

    expect(result.isError).toBeFalse();
    expect(existsSync(path)).toBeFalse();
    expect(notifications).toEqual(["notes: deleted: note.md - saved locally"]);
  });
});
