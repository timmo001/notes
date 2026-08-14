import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { CliRenderer, KeyEvent } from "@opentui/core";
import { StatusList } from "../../src/tui/StatusList.js";
import { TEST_THEME } from "../support/tui.js";

describe("StatusList", () => {
  let renderer: CliRenderer | undefined;
  afterEach(() => renderer?.destroy());

  test("keeps two-row items and truncates long text", async () => {
    const setup = await createTestRenderer({ width: 30, height: 9 });
    renderer = setup.renderer;
    const list = makeList(renderer, 4);
    renderer.root.add(list);
    list.setActive(true);
    await setup.flush();
    const frame = setup.captureCharFrame();
    expect(list.scrollBox.getRenderable("list-row-0")?.height).toBe(2);
    expect(frame).not.toContain("that must truncate");
    expect(frame).not.toContain("that must not wrap");
    expect(frame).toContain("...");
    expect(frame.split("\n").filter((line) => line.trim()).length).toBe(9);
  });

  test("page navigation lands on complete item boundaries", async () => {
    const setup = await createTestRenderer({ width: 30, height: 9 });
    renderer = setup.renderer;
    const list = makeList(renderer, 12);
    renderer.root.add(list);
    list.setActive(true);
    await setup.flush();
    list.handleKeyPress({ name: "pagedown" } as KeyEvent);
    await setup.flush();
    expect([0, 1, 3, 5, 7, 9, 11, 13, 14, 16, 18, 20, 22]).toContain(
      list.scrollBox.scrollTop,
    );
    expect(list.getSelectedItem()?.id).toBe("4");
    list.handleKeyPress({ name: "pageup" } as KeyEvent);
    await setup.flush();
    expect(list.getSelectedItem()?.id).toBe("0");
  });

  test("realigns across the required resize sequence", async () => {
    const setup = await createTestRenderer({ width: 120, height: 36 });
    renderer = setup.renderer;
    const list = makeList(renderer, 20);
    renderer.root.add(list);
    list.setActive(true);
    await setup.flush();
    for (const [width, height] of [
      [80, 24],
      [60, 20],
      [120, 36],
    ] as const) {
      setup.resize(width, height);
      await setup.flush();
      list.realign();
      expect([
        0, 1, 3, 5, 7, 9, 11, 13, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34,
        36, 38,
      ]).toContain(list.scrollBox.scrollTop);
    }
  });

  test("keeps the section header when it fits an odd-height viewport", async () => {
    const setup = await createTestRenderer({ width: 30, height: 7 });
    renderer = setup.renderer;
    const list = makeList(renderer, 12);
    renderer.root.add(list);
    list.setActive(true);
    await setup.flush();
    for (let index = 0; index < 6; index++) list.selectNext();
    await setup.flush();
    expect(list.getSelectedItem()?.id).toBe("6");
    expect([0, 1, 3, 5, 7, 9, 11, 13, 14]).toContain(list.scrollBox.scrollTop);
    expect(setup.captureCharFrame()).toContain("Two");
  });
});

function makeList(renderer: CliRenderer, count: number) {
  return new StatusList(renderer, {
    id: "list",
    theme: TEST_THEME,
    onSelect: () => {},
    items: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      title: `A very long note title ${index} that must truncate`,
      description: `A very long description ${index} that must not wrap`,
      color: TEST_THEME.accent,
      section: index < 6 ? "One" : "Two",
      value: index,
    })),
  });
}
