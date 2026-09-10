import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { herdrIds } from "@herdr/sdk";
import { activeNoteCount } from "../../src/notes/activeCount.js";
import { renderDraft } from "../../src/notes/frontmatter.js";
import { Notes } from "../../src/notes/services/Notes.js";
import { CommandExecutor } from "../../src/services/CommandExecutor.js";
import { Config } from "../../src/services/Config.js";
import { herdrFixture } from "../support/herdr.js";

const directories: string[] = [];
const servers: Awaited<ReturnType<typeof herdrFixture>>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test.each([
  {
    paneCwd: "/repos/shell",
    foregroundCwd: "/repos/active/src",
    cwd: "/repos/active/src",
  },
  { paneCwd: "/repos/shell", foregroundCwd: undefined, cwd: "/repos/shell" },
])("counts $cwd even with the caller's Notes layer loaded", async (options) => {
  const server = await herdrFixture(options);
  servers.push(server);
  const notesDir = mkdtempSync(join(tmpdir(), "notes-active-count-"));
  directories.push(notesDir);
  for (const repo of ["active", "other"]) {
    const directory = join(notesDir, "projects/example", repo);
    mkdirSync(directory, { recursive: true });
    for (const kind of ["note", "handoff"] as const)
      writeFileSync(
        join(directory, `${kind}.md`),
        renderDraft(
          kind,
          { owner: "example", repo },
          "now",
          kind,
          "Description",
        ),
      );
  }
  const result = await Effect.runPromise(
    activeNoteCount().pipe(
      Effect.provide(Notes.layer),
      Effect.provide(server.layer),
      Effect.provideService(Config, {
        notesDir,
        projectDir: "/wrong",
        stateDir: join(notesDir, "state"),
      }),
      Effect.provideService(
        CommandExecutor,
        CommandExecutor.of({
          run: (command, args, input) => {
            expect(command).toBe("git");
            expect(input?.cwd).toBe(options.cwd);
            if (args[0] === "rev-parse") return Effect.succeed("/repos/active");
            if (args.length === 1) return Effect.succeed("origin");
            return Effect.succeed("https://github.com/example/active.git");
          },
          exitCode: () => Effect.die("Unexpected command"),
        }),
      ),
    ),
  );
  expect(result).toMatchObject({
    workspaceId: herdrIds.workspace("w1"),
    paneId: herdrIds.pane("w1:p2"),
    cwd: herdrIds.absolutePath(options.cwd),
    count: 2,
  });
  expect(result?.notePaths.toSorted()).toEqual([
    join(notesDir, "projects/example/active/handoff.md"),
    join(notesDir, "projects/example/active/note.md"),
  ]);
});

test.each([
  { focusedPaneId: null, paneCwd: "/repos/active" },
  { focusedPaneId: "missing", paneCwd: "/repos/active" },
  {},
])("returns no count without a focused pane directory: %j", async (options) => {
  const server = await herdrFixture(options);
  servers.push(server);
  const result = await Effect.runPromise(
    activeNoteCount().pipe(
      Effect.provide(server.layer),
      Effect.provideService(Config, {
        notesDir: "/unused",
        projectDir: "/wrong",
        stateDir: "/unused",
      }),
      Effect.provideService(
        CommandExecutor,
        CommandExecutor.of({
          run: () => Effect.die("Must not resolve the caller's project"),
          exitCode: () => Effect.die("Unexpected command"),
        }),
      ),
    ),
  );
  expect(result).toBeNull();
});
