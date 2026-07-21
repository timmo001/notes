import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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
  const projectDir = mkdtempSync(join(parent, "notes-project-"));
  temporaryDirectories.push(projectDir);
  git(projectDir, "init");
  git(projectDir, "remote", "add", "origin", identity.remoteUrl);
  const path = join(root, "projects", "timmo001", "notes", "note.md");
  mkdirSync(join(root, "projects", "timmo001", "notes"), {
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
    Layer.provideMerge(Layer.succeed(Config, { notesDir: root, projectDir })),
  );
  return { root, path, layer };
}

function serviceLayer(root: string, projectDir = process.cwd()) {
  return Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(Layer.succeed(Config, { notesDir: root, projectDir })),
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("Notes service", () => {
  test("prefers a remote identity when one can be parsed", async () => {
    const { layer } = fixture();

    const context = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(layer)),
    );

    expect(context.repository).toEqual(identity);
    expect(context.notesPath).toEndWith("projects/timmo001/notes");
    expect(context.repoNotesRoot).toBe(context.projectsRoot);
  });

  test("uses the Git root name when no remote exists", async () => {
    const { root } = fixture();
    const projectDir = mkdtempSync(join(tmpdir(), "local-git-project-"));
    temporaryDirectories.push(projectDir);
    git(projectDir, "init");

    const context = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(context.repository).toEqual({
      source: "local",
      owner: "local",
      repo: basename(projectDir),
    });
    expect(context.notesPath).toBe(
      join(root, "projects", "local", basename(projectDir)),
    );
    expect(context.warnings).toContain(
      "No git remotes detected; using local project identity",
    );
  });

  test("uses the working-directory name outside Git", async () => {
    const { root } = fixture();
    const projectDir = mkdtempSync(join(tmpdir(), "local-directory-"));
    temporaryDirectories.push(projectDir);

    const context = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(context.repository).toEqual({
      source: "local",
      owner: "local",
      repo: basename(projectDir),
    });
    expect(context.warnings).toEqual([]);
  });

  test("lists only the local project outside Git", async () => {
    const { root } = fixture();
    const projectDir = mkdtempSync(join(tmpdir(), "local-directory-"));
    temporaryDirectories.push(projectDir);
    const localNotesPath = join(
      root,
      "projects",
      "local",
      basename(projectDir),
    );
    mkdirSync(localNotesPath, { recursive: true });
    writeFileSync(
      join(localNotesPath, "local.md"),
      renderDraft(
        "note",
        {
          source: "local",
          owner: "local",
          repo: basename(projectDir),
        },
        "date",
        "Local",
        "Local description",
      ),
    );

    const entries = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).list();
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(entries.map((entry) => entry.filename)).toEqual(["local.md"]);
  });

  test("uses the current repository for TUI startup when a remote resolves", async () => {
    const { layer } = fixture();

    const scope = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope();
      }).pipe(Effect.provide(layer)),
    );

    expect(scope).toMatchObject({
      scope: "current",
      repoSlug: "timmo001/notes",
      entries: [{ filename: "note.md", repoSlug: "timmo001/notes" }],
    });
  });

  test("uses all repositories for TUI startup without a remote", async () => {
    const { root } = fixture();
    const projectDir = mkdtempSync(join(tmpdir(), "local-directory-"));
    temporaryDirectories.push(projectDir);
    const repoSlug = `local/${basename(projectDir)}`;
    const localNotesPath = join(
      root,
      "projects",
      "local",
      basename(projectDir),
    );
    mkdirSync(localNotesPath, { recursive: true });
    writeFileSync(
      join(localNotesPath, "local.md"),
      renderDraft(
        "note",
        { source: "local", owner: "local", repo: basename(projectDir) },
        "date",
        "Local",
        "Local description",
      ),
    );

    const scope = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope();
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(scope).toMatchObject({ scope: "all", repoSlug });
    if (scope.scope !== "all") throw new Error("Expected all-repository scope");
    expect(scope.sections.map((section) => section.repoSlug)).toEqual([
      repoSlug,
      "timmo001/notes",
    ]);
    expect(
      scope.sections.find((section) => section.repoSlug === repoSlug)?.entries,
    ).toMatchObject([{ filename: "local.md", repoSlug }]);
  });

  test("uses local TUI fallback when the remote cannot be parsed", async () => {
    const { root } = fixture();
    const projectDir = mkdtempSync(join(tmpdir(), "local-git-project-"));
    temporaryDirectories.push(projectDir);
    git(projectDir, "init");
    git(projectDir, "remote", "add", "origin", "not-a-repository-url");

    const scope = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope();
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(scope).toMatchObject({
      scope: "all",
      repoSlug: `local/${basename(projectDir)}`,
    });
  });

  test("lists markdown notes newest-first with parsed metadata", async () => {
    const { root, path, layer } = fixture();
    const notesPath = join(root, "projects", "timmo001", "notes");
    const malformedPath = join(notesPath, "newer.md");
    writeFileSync(malformedPath, "not frontmatter");
    writeFileSync(join(notesPath, "ignored.txt"), "ignored");
    utimesSync(path, new Date(1_000), new Date(1_000));
    utimesSync(malformedPath, new Date(2_000), new Date(2_000));

    const entries = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).list();
      }).pipe(Effect.provide(layer)),
    );

    expect(entries.map((entry) => entry.filename)).toEqual([
      "newer.md",
      "note.md",
    ]);
    expect(entries[0]).toMatchObject({
      name: null,
      description: null,
      tags: [],
      priority: null,
    });
    expect(entries[1]).toMatchObject({
      name: "Note",
      description: "Description",
      tags: ["draft"],
    });
  });

  test("lists non-empty repositories in owner and repository order", async () => {
    const { root, layer } = fixture();
    const otherPath = join(root, "projects", "alpha", "zeta");
    mkdirSync(otherPath, { recursive: true });
    writeFileSync(
      join(otherPath, "other.md"),
      renderDraft(
        "note",
        { ...identity, owner: "alpha", repo: "zeta" },
        "date",
        "Other",
        "Other description",
      ),
    );
    mkdirSync(join(root, "projects", "empty", "repo"), {
      recursive: true,
    });

    const sections = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).listAll();
      }).pipe(Effect.provide(layer)),
    );

    expect(sections.map((section) => section.repoSlug)).toEqual([
      "alpha/zeta",
      "timmo001/notes",
    ]);
    expect(sections[0]?.entries[0]).toMatchObject({
      filename: "other.md",
      repoSlug: "alpha/zeta",
    });
  });

  test("includes note contents only for note-reference context", async () => {
    const { layer } = fixture();

    const reference = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({
          command: "note-reference",
        });
      }).pipe(Effect.provide(layer)),
    );
    const ordinary = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({
          command: "unrelated-command",
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(reference.entries).toHaveLength(1);
    expect(reference.contents?.[0]).toMatchObject({ filename: "note.md" });
    expect(reference.contents?.[0]?.content).toContain("# Note");
    expect(ordinary.entries).toEqual([]);
    expect(ordinary.contents).toBeUndefined();
  });

  test("creates a unique slug when a note filename already exists", async () => {
    const { layer } = fixture();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).create(
          "note",
          "Note",
          "New description",
          async () => {},
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(result.created).toBeTrue();
    expect(result.draft.entry.filename).toBe("note-2.md");
    expect(result.git.commit).toMatchObject({ ok: true, committed: true });
  });

  test("updates priority without changing the note body", async () => {
    const { path, layer } = fixture();
    const bodyBefore = readFileSync(path, "utf8").split("---\n").at(-1);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* Notes).setPriority(path, "critical");
      }).pipe(Effect.provide(layer)),
    );
    const content = readFileSync(path, "utf8");

    expect(result.commit).toMatchObject({ ok: true, committed: true });
    expect(content).toContain("priority: critical");
    expect(content.split("---\n").at(-1)).toBe(bodyBefore);
  });

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
    expect(changed).toContain("projects/timmo001/notes/note.md");
  });

  test("initializes a fresh vault before acquiring its lock", async () => {
    const parent = mkdtempSync(join(tmpdir(), "notes-fresh-parent-"));
    temporaryDirectories.push(parent);
    const root = join(parent, "vault");
    const path = join(root, "projects", "timmo001", "notes", "note.md");
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
