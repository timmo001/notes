import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDraft } from "../../../src/notes/frontmatter.js";
import { Notes } from "../../../src/notes/services/Notes.js";
import { CommandExecutor } from "../../../src/services/CommandExecutor.js";
import { Config } from "../../../src/services/Config.js";
import { Notifier } from "../../../src/mcp/services/Notifier.js";
import { registerNotesTools } from "../../../src/mcp/tools/notes.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("notes MCP tools", () => {
  test("note_read returns content and a revision hash", async () => {
    const root = mkdtempSync(join(tmpdir(), "notes-mcp-"));
    temporaryDirectories.push(root);
    const path = join(root, "repo-notes", "timmo001", "notes", "note.md");
    mkdirSync(join(root, "repo-notes", "timmo001", "notes"), {
      recursive: true,
    });
    writeFileSync(
      path,
      renderDraft(
        "note",
        {
          owner: "timmo001",
          repo: "notes",
          remote: "origin",
          remoteUrl: "git@github.com:timmo001/notes.git",
        },
        "date",
        "Note",
        "Description",
      ),
    );

    const layer = Layer.mergeAll(
      McpServer.McpServer.layer,
      Notes.layer.pipe(
        Layer.provideMerge(CommandExecutor.layer),
        Layer.provideMerge(Layer.succeed(Config, { notesDir: root })),
      ),
      Notifier.layerNoop,
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerNotesTools;
        const server = yield* McpServer.McpServer;
        return yield* server
          .callTool({
            name: "note_read",
            arguments: { path },
          })
          .pipe(
            Effect.provideService(
              McpSchema.McpServerClient,
              McpSchema.McpServerClient.of({
                clientId: 1,
                initializePayload: {
                  protocolVersion: "2025-03-26",
                  capabilities: {},
                  clientInfo: { name: "test", version: "1" },
                },
                getClient: Effect.die("not used in this test"),
              }),
            ),
          );
      }).pipe(Effect.provide(layer)),
    );
    expect(result.isError).toBeFalse();
    const text =
      result.content[0]?.type === "text" ? result.content[0].text : "";
    expect(JSON.parse(text)).toMatchObject({ path, hash: expect.any(String) });
  });
});
