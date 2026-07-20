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
  readonly projects: string;
} {
  const root = mkdtempSync(join(tmpdir(), "notes-files-"));
  temporaryDirectories.push(root);
  return { root, projects: join(root, "projects") };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("note files", () => {
  test("atomically creates and replaces a note", () => {
    const { projects } = temporaryVault();
    const path = join(projects, "owner", "repo", "note.md");
    atomicWriteNoteFile(projects, path, "first");
    const firstHash = readNoteFile(projects, path).hash;
    atomicWriteNoteFile(projects, path, "second");
    expect(readNoteFile(projects, path)).toMatchObject({ content: "second" });
    expect(readNoteFile(projects, path).hash).not.toBe(firstHash);
  });

  test("creates unique draft names without overwriting", () => {
    const { projects } = temporaryVault();
    const first = createExclusiveNoteFile(
      projects,
      "owner",
      "repo",
      "draft",
      "first",
    );
    const second = createExclusiveNoteFile(
      projects,
      "owner",
      "repo",
      "draft",
      "second",
    );
    expect(first).toEndWith("draft.md");
    expect(second).toEndWith("draft-2.md");
    expect(readNoteFile(projects, first).content).toBe("first");
  });

  test("rejects paths outside projects", () => {
    const { root, projects } = temporaryVault();
    expect(() =>
      atomicWriteNoteFile(projects, join(root, "outside.md"), "content"),
    ).toThrow("outside");
  });

  test("rejects symlinked parent directories", () => {
    const { root, projects } = temporaryVault();
    const outside = join(root, "outside");
    mkdirSync(projects);
    mkdirSync(outside);
    symlinkSync(outside, join(projects, "owner"));
    expect(() =>
      atomicWriteNoteFile(
        projects,
        join(projects, "owner", "repo", "note.md"),
        "content",
      ),
    ).toThrow("physical directory");
  });

  test("rejects leaf symlinks", () => {
    const { root, projects } = temporaryVault();
    const directory = join(projects, "owner", "repo");
    const outside = join(root, "outside.md");
    mkdirSync(directory, { recursive: true });
    writeFileSync(outside, "secret");
    symlinkSync(outside, join(directory, "note.md"));
    expect(() => readNoteFile(projects, join(directory, "note.md"))).toThrow(
      "physical regular file",
    );
  });

  test("rejects dangling leaf symlinks on write", () => {
    const { root, projects } = temporaryVault();
    const directory = join(projects, "owner", "repo");
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "note.md");
    symlinkSync(join(root, "missing.md"), path);
    expect(() => atomicWriteNoteFile(projects, path, "content")).toThrow(
      "physical regular file",
    );
  });

  test("rejects symlinked repository directories during listing validation", () => {
    const { root, projects } = temporaryVault();
    const outside = join(root, "outside");
    mkdirSync(join(projects, "owner"), { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(projects, "owner", "repo"));
    expect(() =>
      resolveRepositoryNotesDirectory(
        projects,
        join(projects, "owner", "repo"),
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
