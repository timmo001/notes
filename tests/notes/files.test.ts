import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Effect } from "effect";
import {
  atomicWriteNoteFile,
  createExclusiveNoteFile,
  ensurePhysicalVaultRoot,
  readNoteFile,
  resolveRepositoryNotesDirectory,
} from "../../src/notes/files.js";
import {
  makeDirectory,
  createTempDirectory,
  removePath,
  runScoped,
  symlinkPath,
  writeTextFile,
} from "../support/platform.js";

const temporaryDirectories: string[] = [];

async function temporaryVault() {
  const root = await createTempDirectory("notes-files-");
  temporaryDirectories.push(root);

  return { root, projects: join(root, "projects") };
}

/** Resolve with the failure message so tests can assert on it. */
function failureMessage<A, E extends Error, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<string, never, R> {
  return effect.pipe(
    Effect.flip,
    Effect.map((error) => error.message),
    Effect.orDie,
  );
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0))
    await removePath(directory);
});

describe("note files", () => {
  test("atomically creates and replaces a note", async () => {
    const { projects } = await temporaryVault();
    const path = join(projects, "owner", "repo", "note.md");

    const { firstHash, second, secondHash } = await runScoped(
      Effect.gen(function* () {
        yield* atomicWriteNoteFile(projects, path, "first");
        const first = yield* readNoteFile(projects, path);
        yield* atomicWriteNoteFile(projects, path, "second");
        const replaced = yield* readNoteFile(projects, path);

        return {
          firstHash: first.hash,
          second: replaced,
          secondHash: replaced.hash,
        };
      }),
    );

    expect(second).toMatchObject({ content: "second" });
    expect(secondHash).not.toBe(firstHash);
  });

  test("creates unique draft names without overwriting", async () => {
    const { projects } = await temporaryVault();

    const { first, second, content } = await runScoped(
      Effect.gen(function* () {
        const first = yield* createExclusiveNoteFile(
          projects,
          "owner",
          "repo",
          "draft",
          "first",
        );

        const second = yield* createExclusiveNoteFile(
          projects,
          "owner",
          "repo",
          "draft",
          "second",
        );

        return {
          first,
          second,
          content: (yield* readNoteFile(projects, first)).content,
        };
      }),
    );

    expect(first).toEndWith("draft.md");
    expect(second).toEndWith("draft-2.md");
    expect(content).toBe("first");
  });

  test("rejects paths outside projects", async () => {
    const { root, projects } = await temporaryVault();

    const message = await runScoped(
      failureMessage(
        atomicWriteNoteFile(projects, join(root, "outside.md"), "content"),
      ),
    );

    expect(message).toContain("outside");
  });

  test("rejects symlinked parent directories", async () => {
    const { root, projects } = await temporaryVault();
    const outside = join(root, "outside");
    await makeDirectory(projects);
    await makeDirectory(outside);
    await symlinkPath(outside, join(projects, "owner"));

    const message = await runScoped(
      failureMessage(
        atomicWriteNoteFile(
          projects,
          join(projects, "owner", "repo", "note.md"),
          "content",
        ),
      ),
    );

    expect(message).toContain("physical directory");
  });

  test("rejects leaf symlinks", async () => {
    const { root, projects } = await temporaryVault();
    const directory = join(projects, "owner", "repo");
    const outside = join(root, "outside.md");
    await makeDirectory(directory);
    await writeTextFile(outside, "secret");
    await symlinkPath(outside, join(directory, "note.md"));

    const message = await runScoped(
      failureMessage(readNoteFile(projects, join(directory, "note.md"))),
    );

    expect(message).toContain("physical regular file");
  });

  test("rejects dangling leaf symlinks on write", async () => {
    const { root, projects } = await temporaryVault();
    const directory = join(projects, "owner", "repo");
    await makeDirectory(directory);
    const path = join(directory, "note.md");
    await symlinkPath(join(root, "missing.md"), path);

    const message = await runScoped(
      failureMessage(atomicWriteNoteFile(projects, path, "content")),
    );

    expect(message).toContain("physical regular file");
  });

  test("rejects symlinked repository directories during listing validation", async () => {
    const { root, projects } = await temporaryVault();
    const outside = join(root, "outside");
    await makeDirectory(join(projects, "owner"));
    await makeDirectory(outside);
    await symlinkPath(outside, join(projects, "owner", "repo"));

    const message = await runScoped(
      failureMessage(
        resolveRepositoryNotesDirectory(
          projects,
          join(projects, "owner", "repo"),
        ),
      ),
    );

    expect(message).toContain("physical directory");
  });

  test("rejects a symlinked vault root", async () => {
    const { root } = await temporaryVault();
    const outside = join(root, "outside");
    const linked = join(root, "linked");
    await makeDirectory(outside);
    await symlinkPath(outside, linked);

    const message = await runScoped(
      failureMessage(ensurePhysicalVaultRoot(linked)),
    );

    expect(message).toContain("physical directory");
  });
});
