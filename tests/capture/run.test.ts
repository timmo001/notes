import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { join } from "node:path";
import { captureStatus, processLocalCapture } from "../../src/capture/run.js";
import {
  createTempDirectory,
  pathExists,
  readTextFile,
  removePath,
  runScoped,
  writeTextFile,
} from "../support/platform.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await removePath(root);
});

describe("local capture", () => {
  test("checks executable availability and processes a validated capture through argv", async () => {
    const { root, configPath } = await writeConfig();
    expect(await runScoped(captureStatus(configPath))).toEqual({
      available: true,
    });
    expect(await pathExists(join(root, "prompt"))).toBe(false);

    const result = await runScoped(
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
    const prompt = await readTextFile(join(root, "prompt"));
    expect(prompt).toContain(
      "The trusted target repository is owner/repository",
    );
    expect(
      Buffer.from(
        prompt.match(/<captured-note-base64>\n([^\n]+)/)?.[1] ?? "",
        "base64",
      ).toString(),
    ).toContain("- Target repository: owner/repository");
    expect(await readTextFile(join(root, "cwd"))).toBe(root);
  });

  test("rejects invalid input before starting OpenCode", async () => {
    const { root, configPath } = await writeConfig();

    const result = await runScoped(
      Effect.exit(
        processLocalCapture(configPath, {
          version: 1,
          requestId: crypto.randomUUID(),
          text: " ",
          capturedAt: new Date().toISOString(),
          source: "text",
        }),
      ),
    );

    expect(result._tag).toBe("Failure");
    expect(await pathExists(join(root, "prompt"))).toBe(false);
  });
});

async function writeConfig() {
  const root = await createTempDirectory("notes-capture-");
  roots.push(root);
  const configPath = join(root, "daemon.yml");
  await writeTextFile(
    join(root, "processor.js"),
    `
    const fs = require("node:fs");
    if (process.argv[2] === "service") {
      console.log(process.argv[3] === "status" ? "http://127.0.0.1:49374" : "test-password");
      process.exit(0);
    }
    if (process.argv[2] === "api") {
      const path = process.argv[6];
      if (path.startsWith("/api/plugin/await-activation?")) process.exit(1);
      if (path.startsWith("/api/agent?")) {
        console.log(JSON.stringify({ location: { directory: process.cwd() }, data: [{
          id: "notes-daemon", permissions: [
            { action: "*", resource: "*", effect: "deny" },
            { action: "notes_note_write", resource: "*", effect: "allow" },
          ],
        }] }));
        process.exit(0);
      }
      if (process.argv[5] === "post") {
        fs.writeFileSync("session.json", JSON.stringify({ data: {
          ...JSON.parse(process.argv.at(-1)), id: "ses_capture",
        } }));
      }
      console.log(fs.readFileSync("session.json", "utf8"));
      process.exit(0);
    }
    if (process.argv[process.argv.indexOf("--session") + 1] !== "ses_capture") process.exit(1);
    fs.writeFileSync("prompt", process.argv.at(-1));
    fs.writeFileSync("cwd", process.env.PWD);
    console.error("diagnostic, not JSON");
    console.log(JSON.stringify({ type: "text", part: { messageID: "msg_1", text: "STATUS: success\\nSaved note abc123" } }));
  `,
  );
  await writeTextFile(
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
