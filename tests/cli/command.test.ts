import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import "../../src/index.js";
import { renderHelp } from "../../src/cli/help.js";

describe("notes command", () => {
  test("renders root help from the Effect command tree", async () => {
    const help = await Effect.runPromise(renderHelp());

    expect(help).toContain("USAGE\n  notes <subcommand> [flags]");
    expect(help).toContain("SUBCOMMANDS");
    expect(help).toContain("handoffs, handoff");
  });

  test("renders typed command flags", async () => {
    const help = await Effect.runPromise(renderHelp("priority"));

    expect(help).toContain("--path");
    expect(help).toContain("--value");
    expect(help).toContain("low, medium, high, critical");
  });
});
