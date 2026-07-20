import { describe, expect, test } from "bun:test";
import {
  readFrontmatter,
  renderDraft,
  setFrontmatterField,
  validateNoteContent,
} from "../../src/notes/frontmatter.js";

const identity = {
  source: "remote" as const,
  owner: "timmo001",
  repo: "notes",
  remote: "origin",
  remoteUrl: "git@github.com:timmo001/notes.git",
};

describe("note frontmatter", () => {
  test("round-trips YAML-significant draft values", () => {
    const content = renderDraft(
      "note",
      identity,
      "2026-07-10T12:00:00+01:00",
      "Review: paths #1",
      "Quotes ' and \" plus: values # stay data",
    );
    expect(readFrontmatter(content)).toEqual({
      name: "Review: paths #1",
      description: "Quotes ' and \" plus: values # stay data",
      tags: ["draft"],
      priority: null,
    });
  });

  test("updates fields without changing the body", () => {
    const content = renderDraft(
      "handoff",
      identity,
      "old",
      "Handoff",
      "Description",
    );
    const updated = setFrontmatterField(content, "date", "new");
    expect(updated).toContain("date: new");
    expect(updated.slice(updated.indexOf("# Handoff"))).toBe(
      content.slice(content.indexOf("# Handoff")),
    );
  });

  test.each([
    "plain markdown",
    "---\nname: one\nname: two\n---\n",
    "---\n- not\n- a map\n---\n",
    "---\nname: &name test\ndescription: *name\n---\n",
    "---\ntags: handoff\n---\n",
  ])("rejects invalid frontmatter", (content) => {
    expect(() => validateNoteContent(content)).toThrow();
  });
});
