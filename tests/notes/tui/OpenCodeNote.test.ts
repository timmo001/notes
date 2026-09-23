import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NoteEntry } from "../../../src/notes/types.js";
import {
  opencodeNotePrompt,
  opencodeNoteDirectory,
} from "../../../src/notes/tui/OpenCodeNote.js";

const entry: NoteEntry = {
  filename: "handoff-plan.md",
  filePath: join(
    tmpdir(),
    "notes-vault",
    "projects",
    "timmo001",
    "example",
    "handoff-plan.md",
  ),
  name: "Example Plan",
  description: "Resume the example implementation",
  tags: ["handoff", "example"],
  priority: "medium",
  mtime: 0,
};

const noteContent = "# Example Plan\n\nFirst line.\n\nSecond line.";

describe("OpenCode note prompt", () => {
  test("uses portable planning instructions with the complete note", () => {
    const prompt = opencodeNotePrompt(entry, noteContent, "plan");

    expect(prompt).toContain("Create an implementation-ready plan");
    expect(prompt).toContain("make its deletion the final implementation step");
    expect(prompt).toContain(
      "----- BEGIN LOADED NOTE: projects/timmo001/example/handoff-plan.md -----",
    );
    expect(prompt).toContain(noteContent);
    expect(prompt).toContain(
      "----- END LOADED NOTE: projects/timmo001/example/handoff-plan.md -----",
    );
  });

  test("keeps default mode on the note-reference prompt path", () => {
    const prompt = opencodeNotePrompt(entry, noteContent, "default");

    expect(prompt.startsWith("/plan")).toBe(false);
    expect(prompt).toContain(noteContent);
  });
});

describe("OpenCode note directory", () => {
  test("targets the selected repository checkout", () => {
    expect(
      opencodeNoteDirectory({
        ...entry,
        repoSlug: "timmo001/example",
        projectDir: process.cwd(),
      }),
    ).toBe(process.cwd());
  });

  test("keeps an unavailable remote checkout path", () => {
    const directory = join(tmpdir(), "missing-notes-project");
    expect(
      opencodeNoteDirectory({
        ...entry,
        repoSlug: "timmo001/example",
        projectDir: directory,
      }),
    ).toBe(directory);
  });

  test("rejects a remote note without a known checkout", () => {
    expect(() =>
      opencodeNoteDirectory({
        ...entry,
        repoSlug: "timmo001/example",
      }),
    ).toThrow(
      "No source checkout is known for timmo001/example. Run Notes from that repository once to record it.",
    );
  });

  test("uses an existing checkout for a local note", async () => {
    const repositoriesRoot = await mkdtemp(join(tmpdir(), "notes-repos-"));
    const directory = join(repositoriesRoot, "example");
    await mkdir(directory);

    expect(
      opencodeNoteDirectory({
        ...entry,
        repoSlug: "local/example",
        projectDir: directory,
      }),
    ).toBe(directory);
  });

  test("inherits the current directory when a local checkout is absent", () => {
    expect(
      opencodeNoteDirectory({
        ...entry,
        repoSlug: "local/missing",
        projectDir: join(tmpdir(), "missing-notes-project"),
      }),
    ).toBeUndefined();
  });
});
