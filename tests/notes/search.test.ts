import { describe, expect, test } from "bun:test";
import { searchNoteEntries } from "../../src/notes/search.js";
import type { NoteEntry } from "../../src/notes/types.js";

function entry(
  filename: string,
  name: string,
  description: string,
  tags: readonly string[],
): NoteEntry {
  return {
    filename,
    filePath: `/notes/${filename}`,
    name,
    description,
    tags,
    priority: null,
    mtime: 0,
  };
}

describe("searchNoteEntries", () => {
  const entries = [
    entry("roadmap.md", "Release roadmap", "Quarterly work", ["planning"]),
    entry("release.md", "Release notes", "Roadmap details", ["archive"]),
    entry("handoff.md", "Current work", "Pending release", ["roadmap"]),
  ];

  test("uses the shared weighted metadata ranking", () => {
    expect(
      searchNoteEntries(entries, "roadmap").map((item) => item.filename),
    ).toEqual(["handoff.md", "roadmap.md", "release.md"]);
  });

  test("preserves input for an empty query", () => {
    expect(searchNoteEntries(entries, "  ")).toBe(entries);
  });
});
