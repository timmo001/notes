import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadDaemonConfig } from "../../src/daemon/config.js";
import {
  createTempDirectory,
  readTextFile,
  removePath,
  runScoped,
  writeTextFile,
} from "../support/platform.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await removePath(root);
});

describe("loadDaemonConfig", () => {
  test("loads validated YAML", async () => {
    const root = await createTempDirectory("notes-daemon-config-");
    roots.push(root);
    const path = join(root, "daemon.yml");
    await writeTextFile(
      path,
      [
        "repository: owner/repo",
        "queueLabel: agent:ready",
        "workerId: desktop",
        "workerActor: worker",
        `opencodeDirectory: ${root}`,
        "opencodeAgent: notes-daemon",
        "opencodeModels:",
        "  - providerID: opencode",
        "    modelID: big-pickle",
        "allowedReadPaths:",
        "  - ~/repos/**",
        "  - ~/.config/dotfiles/**",
        "sessionTimeoutSeconds: 300",
        "passTimeoutSeconds: 900",
        "commandTimeoutSeconds: 30",
        "consecutiveFailureLimit: 3",
        "pollIntervalSeconds: 30",
      ].join("\n"),
    );

    const config = await runScoped(loadDaemonConfig(path));
    expect(config.opencodeCommand).toBe("opencode2");
    expect(config.opencodeArgs).toEqual([]);
    await writeTextFile(
      path,
      "opencodeCommand: ~/.local/bin/processor\nopencodeArgs:\n  - ~/literal argument\n" +
        (await readTextFile(path)),
    );
    const custom = await runScoped(loadDaemonConfig(path));
    expect(custom.opencodeCommand).toBe(
      `${process.env.HOME}/.local/bin/processor`,
    );
    expect(custom.opencodeArgs).toEqual(["~/literal argument"]);
    expect(config.allowedReadPaths).toEqual([
      `${process.env.HOME}/repos/**`,
      `${process.env.HOME}/.config/dotfiles/**`,
    ]);
  });
});
