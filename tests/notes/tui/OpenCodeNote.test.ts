import { describe, expect, test } from "bun:test";
import type { NoteEntry } from "../../../src/notes/types.js";
import {
  opencodeNotePrompt,
  planCommandTemplate,
} from "../../../src/notes/tui/OpenCodeNote.js";

const entry: NoteEntry = {
  filename: "handoff-plan.md",
  filePath:
    "/home/aidan/Documents/notes/projects/timmo001/example/handoff-plan.md",
  name: "Example Plan",
  description: "Resume the example implementation",
  tags: ["handoff", "example"],
  priority: "medium",
  mtime: 0,
};

const noteContent = "# Example Plan\n\nFirst line.\n\nSecond line.";

describe("OpenCode note prompt", () => {
  test("injects the configured plan command with the complete note", () => {
    const prompt = opencodeNotePrompt(
      entry,
      noteContent,
      "plan",
      "Plan this target:\n\n${ARGUMENTS}\n\nFinish with validation.",
    );

    expect(prompt.startsWith("Plan this target:")).toBe(true);
    expect(prompt).not.toContain("${ARGUMENTS}");
    expect(prompt).toContain(
      "----- BEGIN LOADED NOTE: projects/timmo001/example/handoff-plan.md -----",
    );
    expect(prompt).toContain(noteContent);
    expect(prompt).toContain(
      "----- END LOADED NOTE: projects/timmo001/example/handoff-plan.md -----",
    );
  });

  test("uses portable planning instructions when no plan command exists", () => {
    const prompt = opencodeNotePrompt(entry, noteContent, "plan");

    expect(prompt).toContain("Create an implementation-ready plan");
    expect(prompt).toContain("make its deletion the final implementation step");
    expect(prompt).toContain(noteContent);
  });

  test("keeps default mode on the note-reference prompt path", () => {
    const prompt = opencodeNotePrompt(entry, noteContent, "default");

    expect(prompt.startsWith("/plan")).toBe(false);
    expect(prompt).toContain(noteContent);
  });

  test("extracts only a configured plan command template", () => {
    expect(
      planCommandTemplate({
        command: { plan: { template: "Configured plan ${ARGUMENTS}" } },
      }),
    ).toBe("Configured plan ${ARGUMENTS}");
    expect(planCommandTemplate({ command: {} })).toBeNull();
    expect(
      planCommandTemplate({ command: { plan: { template: 1 } } }),
    ).toBeNull();
  });
});
