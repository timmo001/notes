import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  atomicWriteNoteFile,
  createExclusiveNoteFile,
  ensurePhysicalVaultRoot,
  readNoteFile,
  resolveRepositoryNotesDirectory,
} from "../../src/notes/files.js";

const temporaryDirectories: string[] = [];

function temporaryVault(): {
  readonly root: string;
  readonly repoNotes: string;
} {
  const root = mkdtempSync(join(tmpdir(), "notes-files-"));
  temporaryDirectories.push(root);
  return { root, repoNotes: join(root, "repo-notes") };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("note files", () => {
  test("atomically creates and replaces a note", () => {
    const { repoNotes } = temporaryVault();
    const path = join(repoNotes, "owner", "repo", "note.md");
    atomicWriteNoteFile(repoNotes, path, "first");
    const firstHash = readNoteFile(repoNotes, path).hash;
    atomicWriteNoteFile(repoNotes, path, "second");
    expect(readNoteFile(repoNotes, path)).toMatchObject({ content: "second" });
    expect(readNoteFile(repoNotes, path).hash).not.toBe(firstHash);
  });

  test("creates unique draft names without overwriting", () => {
    const { repoNotes } = temporaryVault();
    const first = createExclusiveNoteFile(
      repoNotes,
      "owner",
      "repo",
      "draft",
      "first",
    );
    const second = createExclusiveNoteFile(
      repoNotes,
      "owner",
      "repo",
      "draft",
      "second",
    );
    expect(first).toEndWith("draft.md");
    expect(second).toEndWith("draft-2.md");
    expect(readNoteFile(repoNotes, first).content).toBe("first");
  });

  test("rejects paths outside repo-notes", () => {
    const { root, repoNotes } = temporaryVault();
    expect(() =>
      atomicWriteNoteFile(repoNotes, join(root, "outside.md"), "content"),
    ).toThrow("outside");
  });

  test("rejects symlinked parent directories", () => {
    const { root, repoNotes } = temporaryVault();
    const outside = join(root, "outside");
    mkdirSync(repoNotes);
    mkdirSync(outside);
    symlinkSync(outside, join(repoNotes, "owner"));
    expect(() =>
      atomicWriteNoteFile(
        repoNotes,
        join(repoNotes, "owner", "repo", "note.md"),
        "content",
      ),
    ).toThrow("physical directory");
  });

  test("rejects leaf symlinks", () => {
    const { root, repoNotes } = temporaryVault();
    const directory = join(repoNotes, "owner", "repo");
    const outside = join(root, "outside.md");
    mkdirSync(directory, { recursive: true });
    writeFileSync(outside, "secret");
    symlinkSync(outside, join(directory, "note.md"));
    expect(() => readNoteFile(repoNotes, join(directory, "note.md"))).toThrow(
      "physical regular file",
    );
  });

  test("rejects dangling leaf symlinks on write", () => {
    const { root, repoNotes } = temporaryVault();
    const directory = join(repoNotes, "owner", "repo");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "note.md");
    symlinkSync(join(root, "missing.md"), path);
    expect(() => atomicWriteNoteFile(repoNotes, path, "content")).toThrow(
      "physical regular file",
    );
  });

  test("rejects symlinked repository directories during listing validation", () => {
    const { root, repoNotes } = temporaryVault();
    const outside = join(root, "outside");
    mkdirSync(join(repoNotes, "owner"), { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(repoNotes, "owner", "repo"));
    expect(() =>
      resolveRepositoryNotesDirectory(
        repoNotes,
        join(repoNotes, "owner", "repo"),
      ),
    ).toThrow("physical directory");
  });

  test("rejects a symlinked vault root", () => {
    const { root } = temporaryVault();
    const outside = join(root, "outside");
    const linked = join(root, "linked");
    mkdirSync(outside);
    symlinkSync(outside, linked);
    expect(() => ensurePhysicalVaultRoot(linked)).toThrow("physical directory");
  });
});
