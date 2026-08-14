import { afterEach, describe, expect, test } from "bun:test";
import { parseColor, type CliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { PaneHeader } from "../../src/tui/PaneHeader.js";
import { surfaceBackground } from "../../src/tui/components/styles.js";
import { TEST_THEME } from "../support/tui.js";

describe("PaneHeader", () => {
  let renderer: CliRenderer | undefined;
  afterEach(() => renderer?.destroy());

  test("uses a stable, obvious active state", async () => {
    const setup = await createTestRenderer({ width: 40, height: 4 });
    renderer = setup.renderer;
    const header = new PaneHeader(renderer, "header", TEST_THEME);
    renderer.root.add(header);

    header.update("Notes", "2", false);
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("· Notes 2");
    expect(header.bg.equals(parseColor("transparent"))).toBe(true);

    header.update("Notes", "2", true);
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("▶ Notes 2");
    expect(header.bg.equals(parseColor(TEST_THEME.bgSelected))).toBe(true);
    expect(header.height).toBe(1);
  });

  test("keeps ordinary surfaces transparent for transparent themes", () => {
    expect(surfaceBackground({ ...TEST_THEME, transparent: true })).toBe(
      "transparent",
    );
    expect(surfaceBackground(TEST_THEME)).toBe(TEST_THEME.bgElevated);
  });
});
