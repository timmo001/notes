import { describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { runWithRendererSuspended } from "../../src/tui/SuspendedCommand.js";

async function rendererFixture(events: string[]) {
  const { renderer } = await createTestRenderer({ width: 1, height: 1 });
  renderer.suspend = () => {
    events.push("suspend");
  };
  renderer.currentRenderBuffer.clear = () => {
    events.push("clear");
  };
  renderer.resume = () => {
    events.push("resume");
  };
  renderer.requestRender = () => {
    events.push("render");
  };
  return renderer;
}

describe("runWithRendererSuspended", () => {
  test("returns the work result and restores rendering in order", async () => {
    const events: string[] = [];
    const renderer = await rendererFixture(events);

    const result = await runWithRendererSuspended(
      {
        renderer,
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
    renderer.destroy();
  });

  test("restores rendering when work rejects", async () => {
    const events: string[] = [];
    const renderer = await rendererFixture(events);

    await expect(
      runWithRendererSuspended(
        {
          renderer,
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
    renderer.destroy();
  });
});
