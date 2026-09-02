import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestRenderer } from "@opentui/core/testing";
import { KeyEvent, type CliRenderer } from "@opentui/core";
import {
  NotesView,
  type NotesViewOptions,
} from "../../../src/notes/tui/NotesView.js";
import type { NoteEntry } from "../../../src/notes/types.js";
import { TEST_THEME } from "../../support/tui.js";
import { Dialog } from "../../../src/tui/components/Dialog.js";

const ENTRIES: readonly NoteEntry[] = [
  {
    filename: "long-architecture-decision-document.md",
    filePath:
      "/vault/projects/very-long-owner/very-long-repository/long-architecture-decision-document.md",
    repoSlug: "very-long-owner/very-long-repository",
    name: "A long architecture decision title that cannot wrap",
    description:
      "A detailed description that remains on one row even in compact terminals",
    tags: ["architecture", "long-running-work"],
    priority: "high",
    mtime: 1_786_700_000,
  },
  {
    filename: "handoff.md",
    filePath: "/vault/projects/other/repository/handoff.md",
    repoSlug: "other/repository",
    name: "Implementation handoff",
    description: "Continue the implementation",
    tags: ["handoff"],
    priority: "critical",
    mtime: 1_786_600_000,
  },
];

const MARKDOWN = `---\nname: ignored\n---\n# A long architecture decision title\n\n## Context\n\nThis is realistic Markdown content with enough text to exercise the document surface.\n\n- first item\n- second item\n- third item\n\n## Decision\n\nKeep the layout stable while resizing.`;

describe("NotesView", () => {
  let renderer: CliRenderer | undefined;
  afterEach(() => renderer?.destroy());

  test("matches split, compact and minimum golden frames", async () => {
    const setup = await createTestRenderer({ width: 120, height: 36 });
    renderer = setup.renderer;
    const view = new NotesView(renderer, TEST_THEME, callbacks());
    view.setVisible(true);
    await settle(setup);
    await waitForDocument(setup);
    assertGolden(setup.captureCharFrame(), "notes-view-120x36.txt");
    setup.resize(80, 24);
    await settle(setup);
    await waitForDocument(setup);
    assertGolden(setup.captureCharFrame(), "notes-view-80x24.txt");
    setup.resize(60, 20);
    await settle(setup);
    assertGolden(setup.captureCharFrame(), "notes-view-60x20-list.txt");
    setup.mockInput.pressEnter();
    await settle(setup);
    await waitForDocument(setup);
    assertGolden(setup.captureCharFrame(), "notes-view-60x20-preview.txt");
    setup.resize(30, 10);
    await settle(setup);
    assertGolden(setup.captureCharFrame(), "notes-view-minimum.txt");
    view.destroy();
  });

  test("preserves interaction state across live resize", async () => {
    const setup = await createTestRenderer({ width: 60, height: 20 });
    renderer = setup.renderer;
    let back = 0;
    const view = new NotesView(
      renderer,
      TEST_THEME,
      callbacks(() => back++),
    );
    view.setVisible(true);
    await setup.flush();
    await Promise.resolve();
    await setup.flush();
    setup.mockInput.pressArrow("down");
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("Implementation handoff");
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("Implementation handoff");
    setup.mockInput.pressKey("i");
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("Description:");
    setup.resize(120, 36);
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("Description:");
    setup.mockInput.pressKey("?");
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("Keyboard help");
    Dialog.handleTopmostKey(keyEvent("escape"));
    await settle(setup);
    expect(back).toBe(0);
    expect(setup.captureCharFrame()).not.toContain("Keyboard help");
    expect(back).toBe(0);
    view.destroy();
  });

  test("minimum mode ignores every command except Escape and Ctrl+C", async () => {
    const setup = await createTestRenderer({ width: 30, height: 10 });
    renderer = setup.renderer;
    let back = 0;
    const view = new NotesView(
      renderer,
      TEST_THEME,
      callbacks(() => back++),
    );
    view.setVisible(true);
    await settle(setup);
    expect(renderer.currentFocusedRenderable?.id).toBe("notes-minimum-size");
    for (const key of ["?", "a", "i", "return", "tab", "down"])
      emitGlobalKey(renderer, key);
    await settle(setup);
    expect(setup.captureCharFrame()).not.toContain("Keyboard help");
    expect(back).toBe(0);
    emitGlobalKey(renderer, "escape");
    await settle(setup);
    expect(back).toBe(1);
    view.destroy();
  });

  test("body keyboard scrolling updates the marker", async () => {
    const setup = await createTestRenderer({ width: 60, height: 20 });
    renderer = setup.renderer;
    const view = new NotesView(renderer, TEST_THEME, callbacks());
    view.setVisible(true);
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);
    const before = setup.captureCharFrame();
    setup.mockInput.pressKey("pagedown");
    await settle(setup);
    const after = setup.captureCharFrame();
    expect(after).not.toBe(before);
    expect(after).toContain("│");
    view.destroy();
  });

  test("opens the selected note with the chosen installed agent", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    let opened = "";
    let openedMode = "";
    let back = 0;
    const view = new NotesView(renderer, TEST_THEME, {
      ...callbacks(() => back++),
      listAgentTargets: async () => [
        { command: "opencode", executable: "opencode", label: "OpenCode" },
        { command: "claude", executable: "claude", label: "Claude Code" },
      ],
      onOpenAgent: async (_entry, _content, target, mode) => {
        opened = target.command;
        openedMode = mode;
      },
    });
    view.setVisible(true);
    await settle(setup);
    setup.mockInput.pressKey("o");
    await settle(setup);
    expect(setup.captureCharFrame()).toContain("Open in agent");
    emitGlobalKey(renderer, "escape");
    await settle(setup);
    expect(back).toBe(0);
    expect(setup.captureCharFrame()).not.toContain("Open in agent");
    setup.mockInput.pressKey("o");
    await settle(setup);
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    await settle(setup);
    expect(opened).toBe("claude");
    expect(openedMode).toBe("default");
    expect(setup.captureCharFrame()).not.toContain("Open in agent");
    emitGlobalKey(renderer, "o", true);
    await settle(setup);
    setup.mockInput.pressEnter();
    await settle(setup);
    expect(opened).toBe("claude");
    expect(openedMode).toBe("plan");
    view.destroy();
  });
});

function callbacks(onBack = () => {}): NotesViewOptions {
  return {
    loadTuiScope: async () => ({
      scope: "current",
      repoSlug: "very-long-owner/very-long-repository",
      entries: ENTRIES,
    }),
    listAllNotes: async () => [],
    readNote: async () => MARKDOWN,
    deleteNote: async (path) => ({
      path,
      output: "deleted",
      commit: { ok: true, committed: true },
    }),
    listMoveTargets: async () => ["other/repository"],
    moveNote: async (path) => ({
      from: path,
      path,
      output: "moved",
      commit: { ok: true, committed: true },
    }),
    createNote: async () => {
      throw new Error("not used");
    },
    editNote: async () => {
      throw new Error("not used");
    },
    listAgentTargets: async () => [],
    onOpenAgent: async () => {},
    onSetPriority: async () => ({ commit: { ok: true, committed: true } }),
    onBack,
  };
}

async function settle(setup: Awaited<ReturnType<typeof createTestRenderer>>) {
  for (let pass = 0; pass < 2; pass++) {
    await Bun.sleep(5);
    await Promise.resolve();
    await setup.flush();
  }
  await setup.waitForVisualIdle({ quietFrames: 2, maxFrames: 100 });
}

async function waitForDocument(
  setup: Awaited<ReturnType<typeof createTestRenderer>>,
) {
  for (let pass = 0; pass < 100; pass++) {
    if (setup.captureCharFrame().includes("Context")) return;
    await Bun.sleep(5);
    await setup.flush();
  }
  throw new Error("Markdown document did not render");
}

function emitGlobalKey(
  renderer: CliRenderer,
  name: string,
  shift = false,
): void {
  renderer.keyInput.emit("keypress", keyEvent(name, shift));
}

function keyEvent(name: string, shift = false): KeyEvent {
  return new KeyEvent({
    name,
    sequence: name,
    ctrl: false,
    shift,
    meta: false,
    option: false,
    number: false,
    raw: name,
    eventType: "press",
    source: "raw",
  });
}

function assertGolden(frame: string, name: string) {
  const path = join(import.meta.dir, "fixtures", name);
  expect(normalizeFrame(frame)).toBe(
    normalizeFrame(readFileSync(path, "utf8")),
  );
}

function normalizeFrame(frame: string): string {
  return frame
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
