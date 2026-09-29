import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { rejects } from "node:assert/strict";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { renderDraft } from "../../../src/notes/frontmatter.js";
import { rememberRepositoryDirectory } from "../../../src/notes/repositoryDirectories.js";
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
  runProcess,
  runScoped,
  utimesPath,
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

async function git(cwd: string, ...args: string[]): Promise<void> {
  await runGit(cwd, args);
}

async function fixture(parent?: string) {
  const root = await createTempDirectory("notes-service-", parent);
  temporaryDirectories.push(root);
  await git(root, "init");
  await git(root, "config", "user.name", "Notes Test");
  await git(root, "config", "user.email", "notes@example.invalid");
  const projectDir = await createTempDirectory("notes-project-", parent);
  temporaryDirectories.push(projectDir);
  await git(projectDir, "init");
  await git(projectDir, "remote", "add", "origin", identity.remoteUrl);
  const path = join(root, "projects", "timmo001", "notes", "note.md");
  await makeDirectory(join(root, "projects", "timmo001", "notes"));
  await writeTextFile(
    path,
    renderDraft("note", identity, "old", "Note", "Description"),
  );
  await git(root, "add", ".");
  await git(root, "commit", "-m", "Initial note");

  const layer = Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(
      Layer.succeed(Config, {
        notesDir: root,
        projectDir,
        stateDir: join(root, "state"),
      }),
    ),
  );

  return { root, path, layer, projectDir };
}

function serviceLayer(root: string, projectDir = process.cwd()) {
  return Notes.layer.pipe(
    Layer.provideMerge(CommandExecutor.layer),
    Layer.provideMerge(
      Layer.succeed(Config, {
        notesDir: root,
        projectDir,
        stateDir: join(root, "state"),
      }),
    ),
  );
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removePath(directory);
});

describe("Notes service", () => {
  test("prefers a remote identity when one can be parsed", async () => {
    const { layer } = await fixture();

    const context = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(layer)),
    );

    expect(context.repository).toEqual(identity);
    expect(context.notesPath).toEndWith("projects/timmo001/notes");
    expect(context.repoNotesRoot).toBe(context.projectsRoot);
  });

  test("prefers origin over upstream so a fork keeps its own notes", async () => {
    const { layer, projectDir } = await fixture();
    await git(
      projectDir,
      "remote",
      "add",
      "upstream",
      "git@github.com:dmmulroy/notes.git",
    );

    const context = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(layer)),
    );

    expect(context.repository).toEqual(identity);
  });

  test("uses the notes.remote Git config over origin", async () => {
    const { layer, projectDir } = await fixture();
    await git(
      projectDir,
      "remote",
      "add",
      "upstream",
      "git@github.com:dmmulroy/notes.git",
    );
    await git(projectDir, "config", "notes.remote", "upstream");

    const context = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({ command: "test" });
      }).pipe(Effect.provide(layer)),
    );

    expect(context.repository).toMatchObject({
      owner: "dmmulroy",
      repo: "notes",
      remote: "upstream",
    });
  });

  test("uses the Git root name when no remote exists", async () => {
    const { root } = await fixture();

    const projectDir = await createTempDirectory(
      "local-git-project-",
      tmpdir(),
    );

    temporaryDirectories.push(projectDir);
    await git(projectDir, "init");

    const context = await runScoped(
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
    const { root } = await fixture();
    const projectDir = await createTempDirectory("local-directory-", tmpdir());
    temporaryDirectories.push(projectDir);

    const context = await runScoped(
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
    const { root } = await fixture();
    const projectDir = await createTempDirectory("local-directory-", tmpdir());
    temporaryDirectories.push(projectDir);

    const localNotesPath = join(
      root,
      "projects",
      "local",
      basename(projectDir),
    );

    await makeDirectory(localNotesPath);
    await writeTextFile(
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

    const entries = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).list;
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(entries.map((entry) => entry.filename)).toEqual(["local.md"]);
  });

  test("uses the current repository for TUI startup when a remote resolves", async () => {
    const { layer } = await fixture();

    const scope = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope;
      }).pipe(Effect.provide(layer)),
    );

    expect(scope).toMatchObject({
      scope: "current",
      repoSlug: "timmo001/notes",
      entries: [
        {
          filename: "note.md",
          repoSlug: "timmo001/notes",
          projectDir: expect.any(String),
        },
      ],
    });
  });

  test("moves a note to an existing repository scope", async () => {
    const { root, path, layer } = await fixture();
    const destination = join(root, "projects", "local", "aidan");
    await makeDirectory(destination);
    await writeTextFile(
      join(destination, "existing.md"),
      renderDraft(
        "note",
        { source: "local", owner: "local", repo: "aidan" },
        "date",
        "Existing",
        "Destination marker",
      ),
    );

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).move(path, "local/aidan");
      }).pipe(Effect.provide(layer)),
    );

    expect(await pathExists(path)).toBeFalse();
    expect(result.path).toBe(join(destination, "note.md"));
    expect(await readTextFile(result.path)).toContain("name: Note");
    expect(result.commit).toMatchObject({ ok: true, committed: true });
  });

  test("includes remembered repositories as move targets", async () => {
    const { root, layer } = await fixture();
    await runScoped(
      rememberRepositoryDirectory(
        join(root, "state"),
        "local/aidan",
        join(root, "checkout"),
      ),
    );

    const targets = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).moveTargets;
      }).pipe(Effect.provide(layer)),
    );

    expect(targets).toEqual(["local/aidan", "timmo001/notes"]);
  });

  test("rejects unknown move destinations", async () => {
    const { path, layer } = await fixture();

    const error = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).move(path, "local/unknown");
      }).pipe(Effect.flip, Effect.provide(layer)),
    );

    expect(error.message).toBe("Unknown move destination: local/unknown");
    expect(await pathExists(path)).toBeTrue();
  });

  test("does not overwrite a note at the destination", async () => {
    const { root, path, layer } = await fixture();
    const destination = join(root, "projects", "local", "aidan");
    await makeDirectory(destination);
    await writeTextFile(join(destination, "note.md"), "existing");

    const error = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).move(path, "local/aidan");
      }).pipe(Effect.flip, Effect.provide(layer)),
    );

    expect(error.message).toBe(
      "A note named note.md already exists in local/aidan",
    );
    expect(await pathExists(path)).toBeTrue();
    expect(await readTextFile(join(destination, "note.md"))).toBe("existing");
  });

  test("uses all repositories for TUI startup without a remote", async () => {
    const { root } = await fixture();
    const projectDir = await createTempDirectory("local-directory-", tmpdir());
    temporaryDirectories.push(projectDir);
    const repoSlug = `local/${basename(projectDir)}`;

    const localNotesPath = join(
      root,
      "projects",
      "local",
      basename(projectDir),
    );

    await makeDirectory(localNotesPath);
    await writeTextFile(
      join(localNotesPath, "local.md"),
      renderDraft(
        "note",
        { source: "local", owner: "local", repo: basename(projectDir) },
        "date",
        "Local",
        "Local description",
      ),
    );

    const scope = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope;
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
    const { root } = await fixture();

    const projectDir = await createTempDirectory(
      "local-git-project-",
      tmpdir(),
    );

    temporaryDirectories.push(projectDir);
    await git(projectDir, "init");
    await git(projectDir, "remote", "add", "origin", "not-a-repository-url");

    const scope = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope;
      }).pipe(Effect.provide(serviceLayer(root, projectDir))),
    );

    expect(scope).toMatchObject({
      scope: "all",
      repoSlug: `local/${basename(projectDir)}`,
    });
  });

  test("retains known project directories when listing all repositories", async () => {
    const { layer } = await fixture();

    const currentScope = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).tuiScope;
      }).pipe(Effect.provide(layer)),
    );

    if (currentScope.scope !== "current")
      throw new Error("Expected current repository scope");

    const sections = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).listAll;
      }).pipe(Effect.provide(layer)),
    );

    expect(sections[0]?.entries[0]?.projectDir).toBe(
      currentScope.entries[0]?.projectDir,
    );
  });

  test("lists markdown notes newest-first with parsed metadata", async () => {
    const { root, path, layer } = await fixture();
    const notesPath = join(root, "projects", "timmo001", "notes");
    const malformedPath = join(notesPath, "newer.md");
    await writeTextFile(malformedPath, "not frontmatter");
    await writeTextFile(join(notesPath, "ignored.txt"), "ignored");
    await utimesPath(path, new Date(1_000), new Date(1_000));
    await utimesPath(malformedPath, new Date(2_000), new Date(2_000));

    const entries = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).list;
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
    const { root, layer } = await fixture();
    const otherPath = join(root, "projects", "alpha", "zeta");
    await makeDirectory(otherPath);
    await writeTextFile(
      join(otherPath, "other.md"),
      renderDraft(
        "note",
        { ...identity, owner: "alpha", repo: "zeta" },
        "date",
        "Other",
        "Other description",
      ),
    );
    await makeDirectory(join(root, "projects", "empty", "repo"));

    const sections = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).listAll;
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
    const { layer } = await fixture();

    const reference = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).contextPayload({
          command: "note-reference",
        });
      }).pipe(Effect.provide(layer)),
    );

    const ordinary = await runScoped(
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
    const { layer } = await fixture();

    const result = await runScoped(
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

  test("creates a note in an explicit repository with stdin as its body", async () => {
    const { root, layer } = await fixture();

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).createFromInput(
          "other/project",
          "handoff",
          "Continue work",
          "Current implementation state",
          "    const first = true;  \n    const second = true;\n\n",
        );
      }).pipe(Effect.provide(layer)),
    );

    const content = await readTextFile(result.draft.entry.filePath);

    expect(result.draft.entry.filePath).toBe(
      join(root, "projects", "other", "project", "continue-work.md"),
    );
    expect(content).toContain("repo: other/project");
    expect(content).toContain("type: handoff");
    expect(content).toEndWith(
      "\n---\n\n    const first = true;  \n    const second = true;\n",
    );
    expect(result.git.commit).toMatchObject({ ok: true, committed: true });
  });

  test("rejects an unsafe explicit repository before creating a note", async () => {
    const { layer } = await fixture();

    await rejects(
      runScoped(
        Effect.gen(function* () {
          return yield* (yield* Notes).createFromInput(
            "../outside",
            "note",
            "Unsafe",
            "Unsafe target",
            "body",
          );
        }).pipe(Effect.provide(layer)),
      ),
      /Invalid repository/,
    );
  });

  test("resolves note metadata, content, and a remembered checkout", async () => {
    const { root, path, layer } = await fixture();
    await runScoped(
      rememberRepositoryDirectory(
        join(root, "state"),
        "timmo001/notes",
        "/repos/notes",
      ),
    );

    const resolved = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).resolveEntry(path);
      }).pipe(Effect.provide(layer)),
    );

    expect(resolved.entry).toMatchObject({
      filename: "note.md",
      repoSlug: "timmo001/notes",
      projectDir: "/repos/notes",
      name: "Note",
    });
    expect(resolved.content).toContain("# Note");
  });

  test("updates priority without changing the note body", async () => {
    const { path, layer } = await fixture();
    const bodyBefore = (await readTextFile(path)).split("---\n").at(-1);

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).setPriority(path, "critical");
      }).pipe(Effect.provide(layer)),
    );

    const content = await readTextFile(path);

    expect(result.commit).toMatchObject({ ok: true, committed: true });
    expect(content).toContain("priority: critical");
    expect(content.split("---\n").at(-1)).toBe(bodyBefore);
  });

  test("returns a revision and rejects a stale write", async () => {
    const { path, layer } = await fixture();

    const initial = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );

    const updated = initial.content.replace("# Note", "# Updated");
    await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(path, updated, {
          expectedHash: initial.hash,
        });
      }).pipe(Effect.provide(layer)),
    );
    await rejects(
      runScoped(
        Effect.gen(function* () {
          return yield* (yield* Notes).write(path, initial.content, {
            expectedHash: initial.hash,
          });
        }).pipe(Effect.provide(layer)),
      ),
      /Note changed since it was read/,
    );
  });

  test("accepts a tilde path for guarded writes", async () => {
    const { path, layer } = await fixture(process.env.HOME);

    const initial = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );

    const homePath = path.replace(process.env.HOME ?? "", "~");

    const result = await runScoped(
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
    const { root, path, layer } = await fixture();

    const before = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );

    await writeTextFile(join(root, "unfinished.txt"), "unfinished");
    await git(root, "add", "unfinished.txt");
    await rejects(
      runScoped(
        Effect.gen(function* () {
          return yield* (yield* Notes).write(
            path,
            before.content.replace("# Note", "# Should not change"),
          );
        }).pipe(Effect.provide(layer)),
      ),
      /not ready for a mutation/,
    );

    const after = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).read(path);
      }).pipe(Effect.provide(layer)),
    );

    expect(after.content).toBe(before.content);
  });

  test("restores the index after a commit failure", async () => {
    const { root, path, layer } = await fixture();
    await git(root, "config", "user.name", "");
    await git(root, "config", "user.email", "");

    const failed = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(
          path,
          renderDraft("note", identity, "failed", "Failed", "Description"),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(failed.commit).toMatchObject({ ok: false, committed: false });
    await git(root, "diff", "--cached", "--quiet");

    await git(root, "config", "user.name", "Notes Test");
    await git(root, "config", "user.email", "notes@example.invalid");

    const retried = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).write(
          path,
          renderDraft("note", identity, "retry", "Retry", "Description"),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(retried.commit).toMatchObject({ ok: true, committed: true });
  });

  test("validates editor output before committing", async () => {
    const { path, layer } = await fixture();
    await rejects(
      runScoped(
        Effect.gen(function* () {
          return yield* (yield* Notes).edit(
            path,
            async () => await writeTextFile(path, "invalid"),
            false,
          );
        }).pipe(Effect.provide(layer)),
      ),
      /Edited note is invalid/,
    );
  });

  test("allows malformed notes to be repaired in the editor", async () => {
    const { path, layer } = await fixture();
    await writeTextFile(path, "malformed");

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).edit(
          path,
          async () =>
            await writeTextFile(
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
    const { root, path, layer } = await fixture();

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).edit(
          path,
          async () => removePath(path),
          false,
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(result.commit).toMatchObject({ ok: true, committed: true });
    expect(await pathExists(path)).toBeFalse();

    const changed = await runGit(root, [
      "show",
      "--name-status",
      "--format=",
      "HEAD",
    ]);

    expect(changed).toContain("projects/timmo001/notes/note.md");
  });

  test("initializes a fresh vault before acquiring its lock", async () => {
    const parent = await createTempDirectory("notes-fresh-parent-", tmpdir());
    temporaryDirectories.push(parent);
    const root = join(parent, "vault");
    const path = join(root, "projects", "timmo001", "notes", "note.md");
    await makeDirectory(root);
    await git(root, "init");
    await git(root, "config", "user.name", "Notes Test");
    await git(root, "config", "user.email", "notes@example.invalid");

    const result = await runScoped(
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
    const { root, layer } = await fixture();
    let competitor: ReturnType<typeof runProcess> | undefined;
    let competitorSettled = false;

    const created = runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).create(
          "note",
          "Created",
          "Description",
          async () => {
            competitor = runProcess("bun", [
              "-e",
              `import { acquireVaultLock } from ${JSON.stringify(import.meta.dir + "/../../../src/notes/processLock.ts")}; const release = await acquireVaultLock(${JSON.stringify(root)}); await release();`,
            ]);
            void competitor.then(() => {
              competitorSettled = true;
            });
            await Bun.sleep(150);
            expect(competitorSettled).toBeFalse();
          },
        );
      }).pipe(Effect.provide(layer)),
    );

    await created;
    expect((await competitor)?.exitCode).toBe(0);
  });

  test("treats deletion of a new draft as a cancelled create", async () => {
    const { layer } = await fixture();

    const result = await runScoped(
      Effect.gen(function* () {
        return yield* (yield* Notes).create(
          "note",
          "Cancelled",
          "Description",
          async (entry) => removePath(entry.filePath),
        );
      }).pipe(Effect.provide(layer)),
    );

    expect(result.created).toBeFalse();
    expect(result.git.commit).toMatchObject({ ok: true, committed: false });
  });
});
