import { describe, expect, test } from "bun:test";
import type { CliRenderer } from "@opentui/core";
import { runWithRendererSuspended } from "../../src/tui/SuspendedCommand.js";

function rendererFixture(events: string[]) {
  const renderer = {
    suspend: () => events.push("suspend"),
    currentRenderBuffer: { clear: () => events.push("clear") },
    resume: () => events.push("resume"),
    requestRender: () => events.push("render"),
  } as unknown as CliRenderer;
  return renderer;
}

describe("runWithRendererSuspended", () => {
  test("returns the work result and restores rendering in order", async () => {
    const events: string[] = [];

    const result = await runWithRendererSuspended(
      {
        renderer: rendererFixture(events),
        afterResume: () => events.push("afterResume"),
      },
      async () => {
        events.push("work");
        return "result";
      },
    );

    expect(result).toBe("result");
    expect(events).toEqual([
      "suspend",
      "clear",
      "work",
      "clear",
      "resume",
      "afterResume",
      "render",
    ]);
  });

  test("restores rendering when work rejects", async () => {
    const events: string[] = [];

    await expect(
      runWithRendererSuspended(
        {
          renderer: rendererFixture(events),
          afterResume: () => events.push("afterResume"),
        },
        async () => {
          events.push("work");
          throw new Error("failed work");
        },
      ),
    ).rejects.toThrow("failed work");
    expect(events).toEqual([
      "suspend",
      "clear",
      "work",
      "clear",
      "resume",
      "afterResume",
      "render",
    ]);
  });
});
