import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureStatus, processLocalCapture } from "../../src/capture/run.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("local capture", () => {
  test("checks executable availability and processes a validated capture through argv", async () => {
    const { root, configPath } = writeConfig();
    await expect(Effect.runPromise(captureStatus(configPath))).resolves.toEqual(
      { available: true },
    );
    expect(existsSync(join(root, "prompt"))).toBe(false);
    const result = await Effect.runPromise(
      processLocalCapture(configPath, {
        version: 1,
        requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
        text: "Keep this thought",
        capturedAt: "2026-07-21T12:00:00.000Z",
        source: "text",
        repository: "owner/repository",
      }),
    );
    expect(result).toEqual({
      status: "success",
      requestId: "019c92df-71d2-7fb0-8c2e-d29f633a355b",
      summary: "Saved note abc123",
    });
    const prompt = readFileSync(join(root, "prompt"), "utf8");
    expect(prompt).toContain(
      "The trusted target repository is owner/repository",
    );
    expect(
      Buffer.from(
        prompt.match(/<captured-note-base64>\n([^\n]+)/)?.[1] ?? "",
        "base64",
      ).toString(),
    ).toContain("- Target repository: owner/repository");
    expect(readFileSync(join(root, "cwd"), "utf8")).toBe(root);
  });

  test("rejects invalid input before starting OpenCode", async () => {
    const { root, configPath } = writeConfig();
    const result = await Effect.runPromiseExit(
      processLocalCapture(configPath, {
        version: 1,
        requestId: crypto.randomUUID(),
        text: " ",
        capturedAt: new Date().toISOString(),
        source: "text",
      }),
    );
    expect(result._tag).toBe("Failure");
    expect(existsSync(join(root, "prompt"))).toBe(false);
  });
});

function writeConfig() {
  const root = mkdtempSync(join(tmpdir(), "notes-capture-"));
  roots.push(root);
  const configPath = join(root, "daemon.yml");
  writeFileSync(
    join(root, "processor.js"),
    `
    const fs = require("node:fs");
    fs.writeFileSync("prompt", process.argv.at(-1));
    fs.writeFileSync("cwd", process.env.PWD);
    console.error("diagnostic, not JSON");
    console.log(JSON.stringify({ type: "text", part: { messageID: "msg_1", text: "STATUS: success\\nSaved note abc123" } }));
  `,
  );
  writeFileSync(
    configPath,
    [
      "repository: owner/queue",
      "queueLabel: agent:ready",
      "workerId: desktop",
      "workerActor: worker",
      `opencodeCommand: ${process.execPath}`,
      "opencodeArgs:",
      `  - ${join(root, "processor.js")}`,
      `opencodeDirectory: ${root}`,
      "opencodeAgent: notes-daemon",
      "opencodeModels:",
      "  - providerID: opencode",
      "    modelID: test",
      "allowedReadPaths:",
      `  - ${root}/**`,
      "sessionTimeoutSeconds: 30",
      "passTimeoutSeconds: 60",
      "commandTimeoutSeconds: 5",
      "consecutiveFailureLimit: 1",
      "pollIntervalSeconds: 10",
    ].join("\n"),
  );
  return { root, configPath };
}
