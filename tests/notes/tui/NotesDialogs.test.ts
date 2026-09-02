import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { BoxRenderable, KeyEvent, type CliRenderer } from "@opentui/core";
import { CreateNoteDialog } from "../../../src/notes/tui/dialogs/CreateNoteDialog.js";
import { DeleteNoteDialog } from "../../../src/notes/tui/dialogs/DeleteNoteDialog.js";
import { HelpDialog } from "../../../src/notes/tui/dialogs/HelpDialog.js";
import { PriorityDialog } from "../../../src/notes/tui/dialogs/PriorityDialog.js";
import { MoveNoteDialog } from "../../../src/notes/tui/dialogs/MoveNoteDialog.js";
import { AgentDialog } from "../../../src/notes/tui/dialogs/AgentDialog.js";
import { TEST_THEME } from "../../support/tui.js";
import { Dialog } from "../../../src/tui/components/Dialog.js";

describe("Notes dialogs", () => {
  let renderer: CliRenderer | undefined;
  afterEach(() => renderer?.destroy());

  test("create navigates template and submits inputs", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    let result: unknown;
    const dialog = new CreateNoteDialog(
      renderer,
      TEST_THEME,
      (value) => (result = value),
      () => {},
    );
    dialog.show(false);
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    await setup.flush();
    await setup.mockInput.typeText("handoff-name");
    setup.mockInput.pressEnter();
    await setup.mockInput.typeText("description");
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(result).toEqual({
      kind: "handoff",
      name: "handoff-name",
      description: "description",
    });
    dialog.destroy();
  });

  test("direct handoff create focuses the visible name input", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    const dialog = new CreateNoteDialog(
      renderer,
      TEST_THEME,
      () => {},
      () => {},
    );
    dialog.show(true);
    await setup.flush();
    expect(renderer.currentFocusedRenderable?.id).toBe("create-note-name");
    setup.mockInput.pressTab();
    await setup.flush();
    expect(renderer.currentFocusedRenderable?.id).toBe(
      "create-note-description",
    );
    dialog.destroy();
  });

  test("move selection activates the highlighted destination with Enter", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    let moved = "";
    const dialog = new MoveNoteDialog(
      renderer,
      TEST_THEME,
      (repo) => (moved = repo),
      () => {},
    );
    dialog.show(["owner/one", "owner/two"], "note.md");
    setup.mockInput.pressArrow("down");
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(moved).toBe("owner/two");
    expect(dialog.visible).toBe(false);
    dialog.destroy();
  });

  test("agent selection activates the highlighted installed target", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    let selected = "";
    const dialog = new AgentDialog(
      renderer,
      TEST_THEME,
      (target) => (selected = target.command),
      () => {},
    );
    dialog.show(
      [
        { command: "opencode", executable: "opencode", label: "OpenCode" },
        { command: "claude", executable: "claude", label: "Claude Code" },
      ],
      "note.md",
    );
    dialog.handleKeyPress(keyEvent("down"));
    dialog.handleKeyPress(keyEvent("return"));
    await setup.flush();
    expect(selected).toBe("claude");
    expect(dialog.visible).toBe(false);
    dialog.destroy();
  });

  test("priority is preselected and applies", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    let selected = "";
    const dialog = new PriorityDialog(renderer, TEST_THEME, {
      onApply: (value) => (selected = value),
      onDismiss: () => {},
    });
    dialog.show("high", "Note");
    setup.mockInput.pressTab();
    setup.mockInput.pressEnter();
    await setup.flush();
    expect(selected).toBe("high");
    dialog.destroy();
  });

  test("Help groups commands and topmost Escape restores focus", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    const restoredTarget = new BoxRenderable(renderer, {
      id: "restore-target",
      focusable: true,
      width: 1,
      height: 1,
    });
    renderer.root.add(restoredTarget);
    restoredTarget.focus();
    const help = new HelpDialog(renderer, TEST_THEME, () => {});
    let deleted = false;
    const remove = new DeleteNoteDialog(
      renderer,
      TEST_THEME,
      () => (deleted = true),
      () => {},
    );
    help.show();
    remove.show("owner/repo/note.md");
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("Delete note?");
    Dialog.handleTopmostKey(keyEvent("escape"));
    await setup.flush();
    expect(deleted).toBe(false);
    expect(remove.visible).toBe(false);
    expect(help.visible).toBe(true);
    expect(setup.captureCharFrame()).toContain("Keyboard help");
    Dialog.handleTopmostKey(keyEvent("escape"));
    await setup.flush();
    expect(setup.captureCharFrame()).not.toContain("Keyboard help");
    expect(renderer.currentFocusedRenderable).toBe(restoredTarget);
    help.destroy();
    remove.destroy();
    renderer.root.remove(restoredTarget);
  });

  test("open dialogs remeasure and recenter after resize", async () => {
    const setup = await createTestRenderer({ width: 80, height: 24 });
    renderer = setup.renderer;
    const help = new HelpDialog(renderer, TEST_THEME, () => {});
    help.show();
    await setup.flush();
    const before = setup.captureCharFrame();
    setup.resize(60, 20);
    await setup.flush();
    const after = setup.captureCharFrame();
    expect(before.indexOf("╭")).not.toBe(after.indexOf("╭"));
    expect(after).toContain("Keyboard help");
    help.destroy();
  });
});

function keyEvent(name: string): KeyEvent {
  return new KeyEvent({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: name,
    number: false,
    raw: name,
    eventType: "press",
    source: "raw",
  });
}
