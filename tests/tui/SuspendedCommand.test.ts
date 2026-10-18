import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { createTestRenderer } from "@opentui/core/testing";
import { runWithRendererSuspended } from "../../src/tui/SuspendedCommand.js";

async function rendererFixture(events: string[]) {
  const { renderer } = await createTestRenderer({ width: 1, height: 1 });
  renderer.suspend = async () => {
    events.push("suspend");
  };

  renderer.resume = async () => {
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
      "work",
      "resume",
      "afterResume",
      "render",
    ]);
    renderer.destroy();
  });

  test("restores rendering when work rejects", async () => {
    const events: string[] = [];
    const renderer = await rendererFixture(events);

    await rejects(
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
      /failed work/,
    );
    expect(events).toEqual([
      "suspend",
      "work",
      "resume",
      "afterResume",
      "render",
    ]);
    renderer.destroy();
  });
});
