import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { McpSchema, McpServer } from "effect/ai";
import { join } from "node:path";
import { Notifier } from "../../../src/mcp/services/Notifier.js";
import { registerNotesTools } from "../../../src/mcp/tools/notes.js";
import { renderDraft } from "../../../src/notes/frontmatter.js";
import { Notes } from "../../../src/notes/services/Notes.js";
import { CommandExecutor } from "../../../src/services/CommandExecutor.js";
import { Config } from "../../../src/services/Config.js";
import {
  git as runGit,
  makeDirectory,
  createTempDirectory,
  pathExists,
  readTextFile,
  removePath,
  runScoped,
  writeTextFile,
} from "../../support/platform.js";

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
  protocolVersion: "2025-03-26",
  clientCapabilities: {},
  clientInfo: { name: "test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
  getClient: Effect.die("not used in this test"),
});

type ToolArgument = string | number | boolean | null;

async function git(cwd: string, ...args: string[]): Promise<void> {
  await runGit(cwd, args);
}

async function fixture() {
  const root = await createTempDirectory("notes-mcp-");
  temporaryDirectories.push(root);
  await git(root, "init");
  await git(root, "config", "user.name", "Notes Test");
  await git(root, "config", "user.email", "notes@example.invalid");
  const notesPath = join(root, "projects", "timmo001", "notes");
  const path = join(notesPath, "note.md");
  await makeDirectory(notesPath);
  await writeTextFile(
    path,
    renderDraft("note", identity, "date", "Note", "Description"),
  );
  await git(root, "add", ".");
  await git(root, "commit", "-m", "Initial note");

  return { root, notesPath, path };
}

async function callTool(
  root: string,
  name: string,
  args: Record<string, ToolArgument>,
  notifications: string[] = [],
) {
  const layer = Layer.mergeAll(
    McpServer.McpServer.layer,
    Notes.layer.pipe(
      Layer.provideMerge(CommandExecutor.layer),
      Layer.provideMerge(
        Layer.succeed(Config, {
          notesDir: root,
          projectDir: process.cwd(),
          stateDir: join(root, "state"),
        }),
      ),
    ),
    Layer.succeed(Notifier, {
      notify: (title, message) =>
        Effect.sync(() => notifications.push(`${title}: ${message}`)),
    }),
  );

  return runScoped(
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

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removePath(directory);
});

describe("notes MCP tools", () => {
  test("note_read returns content and a revision hash", async () => {
    const { root, path } = await fixture();

    const result = await callTool(root, "note_read", { path });

    expect(result.isError).toBeFalse();
    expect(JSON.parse(resultText(result))).toMatchObject({
      path,
      hash: expect.any(String),
    });
  });

  test("note_list filters tags case-insensitively", async () => {
    const { root, notesPath } = await fixture();
    await writeTextFile(
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
    const { root, path } = await fixture();
    const notifications: string[] = [];
    const read = await callTool(root, "note_read", { path });

    const { content, hash } = Schema.decodeUnknownSync(
      Schema.Struct({ content: Schema.String, hash: Schema.String }),
    )(JSON.parse(resultText(read)));

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
    expect(await readTextFile(path)).toContain("# Updated");
    expect(notifications).toEqual(["notes: written: note.md - saved locally"]);
  });

  test("note_write adds a date when frontmatter omits it", async () => {
    const { root, notesPath } = await fixture();
    const path = join(notesPath, "without-date.md");

    const content = `---
repo: timmo001/notes
name: Without Date
description: Date is owned by Notes.
tags: [test]
---

# Without Date
`;

    const result = await callTool(root, "note_write", { path, content });

    expect(result.isError).toBeFalse();
    expect(resultText(result)).toContain(`Written: ${path}`);
    expect(await readTextFile(path)).toMatch(
      /^date: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/m,
    );
  });

  test("note_write rejects malformed and stale revision hashes", async () => {
    const { root, path } = await fixture();

    const malformed = await callTool(root, "note_write", {
      path,
      content: await readTextFile(path),
      expectedHash: "invalid",
    });

    const stale = await callTool(root, "note_write", {
      path,
      content: await readTextFile(path),
      expectedHash: "0".repeat(64),
    });

    expect(malformed.isError).toBeTrue();
    expect(resultText(malformed)).toContain("lowercase SHA-256 hash");
    expect(stale.isError).toBeTrue();
    expect(resultText(stale)).toContain("Note changed since it was read");
  });

  test("note_delete removes the note and notifies", async () => {
    const { root, path } = await fixture();
    const notifications: string[] = [];

    const result = await callTool(root, "note_delete", { path }, notifications);

    expect(result.isError).toBeFalse();
    expect(await pathExists(path)).toBeFalse();
    expect(notifications).toEqual(["notes: deleted: note.md - saved locally"]);
  });
});
