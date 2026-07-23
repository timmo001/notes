import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDaemonConfig } from "../../src/daemon/config.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("loadDaemonConfig", () => {
  test("loads validated YAML", async () => {
    const root = mkdtempSync(join(tmpdir(), "notes-daemon-config-"));
    roots.push(root);
    const path = join(root, "daemon.yml");
    writeFileSync(
      path,
      [
        "repository: owner/repo",
        `repositoryPath: ${root}`,
        "queueLabel: agent:ready",
        "workerId: desktop",
        "workerActor: worker",
        "opencodeUrl: http://127.0.0.1:4096",
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

    const config = await Effect.runPromise(loadDaemonConfig(path));
    expect(config.repositoryPath).toBe(root);
    expect(config.allowedReadPaths).toEqual([
      `${process.env.HOME}/repos/**`,
      `${process.env.HOME}/.config/dotfiles/**`,
    ]);
  });
});
