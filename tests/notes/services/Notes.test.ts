import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderDraft } from "../../../src/notes/frontmatter.js";
import { Notes } from "../../../src/notes/services/Notes.js";
import { CommandExecutor } from "../../../src/services/CommandExecutor.js";
import { Config } from "../../../src/services/Config.js";

const temporaryDirectories: string[] = [];
const identity = {
  owner: "timmo001",
  repo: "notes",
  remote: "origin",
  remoteUrl: "git@github.com:timmo001/notes.git",
};

function git(cwd: string, ...args: string[]): void {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function fixture(parent = tmpdir()) {
  const root = mkdtempSync(join(parent, "notes-service-"));
  temporaryDirectories.push(root);
  git(root, "init");
  git(root, "config", "user.name", "Notes Test");
  git(root, "config", "user.email", "notes@example.invalid");
  const path = join(root, "repo-notes", "timmo001", "notes", "note.md");
  mkdirSync(join(root, "repo-notes", "timmo001", "notes"), {
    recursive: true,
  });
  writeFileSync(
    path,
    renderDraft("note", identity, "old", "Note", "Description"),
  );
  git(root, "add", ".");
  git(root, "commit", "-m", "Initial note");
  const layer = Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(Layer.succeed(Config, { notesDir: root })),
  );
  return { root, path, layer };
}

function serviceLayer(root: string) {
  return Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(Layer.succeed(Config, { notesDir: root })),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Notes service", () => {
  test("returns a revision and rejects a stale write", async () => {
    const { path, layer } = fixture();
    const initial = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );
    const updated = initial.content.replace("# Note", "# Updated");
    await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(path, updated, {
          expectedHash: initial.hash,
        });
      }).pipe(Effect.provide(layer)),
    );
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Notes).write(path, initial.content, {
            expectedHash: initial.hash,
          });
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow("Note changed since it was read");
  });

  test("accepts a tilde path for guarded writes", async () => {
    const { path, layer } = fixture(process.env.HOME);
    const initial = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );
    const homePath = path.replace(process.env.HOME ?? "", "~");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(
          homePath,
          initial.content.replace("# Note", "# Tilde"),
          { expectedHash: initial.hash },
        );
      }).pipe(Effect.provide(layer)),
    );
    expect(result.commit).toMatchObject({ ok: true, committed: true });
  });

  test("refuses staged work before touching a note", async () => {
    const { root, path, layer } = fixture();
    const before = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );
    writeFileSync(join(root, "unfinished.txt"), "unfinished");
    git(root, "add", "unfinished.txt");
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Notes).write(
            path,
            before.content.replace("# Note", "# Should not change"),
          );
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow("not ready for a mutation");
    const after = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );
    expect(after.content).toBe(before.content);
  });

  test("validates editor output before committing", async () => {
    const { path, layer } = fixture();
    await expect(
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Notes).edit(
            path,
            async () => writeFileSync(path, "invalid"),
            false,
          );
        }).pipe(Effect.provide(layer)),
      ),
    ).rejects.toThrow("Edited note is invalid");
  });

  test("allows malformed notes to be repaired in the editor", async () => {
    const { path, layer } = fixture();
    writeFileSync(path, "malformed");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).edit(
          path,
          async () =>
            writeFileSync(
              path,
              renderDraft("note", identity, "new", "Repaired", "Description"),
            ),
          false,
        );
      }).pipe(Effect.provide(layer)),
    );
    expect(result.commit).toMatchObject({ ok: true, committed: true });
  });

  test("commits a note deleted by the editor", async () => {
    const { root, path, layer } = fixture();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).edit(
          path,
          async () => rmSync(path),
          false,
        );
      }).pipe(Effect.provide(layer)),
    );
    expect(result.commit).toMatchObject({ ok: true, committed: true });
    expect(existsSync(path)).toBeFalse();
    const changed = Bun.spawnSync(
      ["git", "show", "--name-status", "--format=", "HEAD"],
      { cwd: root },
    ).stdout.toString();
    expect(changed).toContain("repo-notes/timmo001/notes/note.md");
  });

  test("initializes a fresh vault before acquiring its lock", async () => {
    const parent = mkdtempSync(join(tmpdir(), "notes-fresh-parent-"));
    temporaryDirectories.push(parent);
    const root = join(parent, "vault");
    const path = join(root, "repo-notes", "timmo001", "notes", "note.md");
    mkdirSync(root);
    git(root, "init");
    git(root, "config", "user.name", "Notes Test");
    git(root, "config", "user.email", "notes@example.invalid");
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(
          path,
          renderDraft("note", identity, "old", "Note", "Description"),
        );
      }).pipe(Effect.provide(serviceLayer(root))),
    );
    expect(result.commit).toMatchObject({ ok: true, committed: true });
  });

  test("keeps draft creation and editing under one lock", async () => {
    const { root, layer } = fixture();
    let competitor: ReturnType<typeof Bun.spawn> | undefined;
    const created = Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).create(
          "note",
          "Created",
          "Description",
          async () => {
            competitor = Bun.spawn(
              [
                "bun",
                "-e",
                `import { acquireVaultLock } from ${JSON.stringify(import.meta.dir + "/../../../src/notes/processLock.ts")}; const release = await acquireVaultLock(${JSON.stringify(root)}); await release();`,
              ],
              { stdout: "ignore", stderr: "pipe" },
            );
            await Bun.sleep(150);
            expect(competitor.exitCode).toBeNull();
          },
        );
      }).pipe(Effect.provide(layer)),
    );
    await created;
    expect(await competitor?.exited).toBe(0);
  });

  test("treats deletion of a new draft as a cancelled create", async () => {
    const { layer } = fixture();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).create(
          "note",
          "Cancelled",
          "Description",
          async (entry) => rmSync(entry.filePath),
        );
      }).pipe(Effect.provide(layer)),
    );
    expect(result.created).toBeFalse();
    expect(result.git.commit).toMatchObject({ ok: true, committed: false });
  });
});
