import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import "../../src/index.js";
import { renderHelp } from "../../src/cli/help.js";

describe("notes command", () => {
  test.each([
    { args: ["root"], output: "/notes-cli-fixture" },
    { args: ["root", "--projects"], output: "/notes-cli-fixture/projects" },
    { args: ["root", "--no-projects"], output: "/notes-cli-fixture" },
  ])("runs $args with optional boolean flags", ({ args, output }) => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
        ...args,
      ],
      { env: { ...process.env, NOTES: "/notes-cli-fixture" } },
    );

    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe(output);
  });

  test.each([
    {
      args: [
        "write",
        "--path",
        "/notes-cli-fixture/projects/example/notes/work.md",
      ],
      flag: "stdin",
    },
    {
      args: [
        "open-agent",
        "--path",
        "/notes-cli-fixture/projects/example/notes/work.md",
        "--agent",
        "cursor",
      ],
      flag: "json",
    },
  ])("keeps --$flag required", ({ args, flag }) => {
    const result = Bun.spawnSync(
      [
        process.execPath,
        fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
        ...args,
      ],
      { env: { ...process.env, NOTES: "/notes-cli-fixture" } },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      `Missing required flag: --${flag}`,
    );
  });

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
