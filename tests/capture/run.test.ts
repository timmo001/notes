import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureStatus, processLocalCapture } from "../../src/capture/run.js";

const roots: string[] = [];
const servers: Bun.Server<unknown>[] = [];
const previousPassword = process.env.OPENCODE_SERVER_PASSWORD;

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  for (const server of servers.splice(0)) server.stop(true);
  if (previousPassword === undefined)
    delete process.env.OPENCODE_SERVER_PASSWORD;
  else process.env.OPENCODE_SERVER_PASSWORD = previousPassword;
});

describe("local capture", () => {
  test("checks availability and processes a validated capture", async () => {
    const prompts: string[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/session")
          return Response.json([]);
        if (request.method === "POST" && url.pathname === "/session")
          return Response.json({ id: "capture-session" });
        if (url.pathname === "/permission" || url.pathname === "/question")
          return Response.json([]);
        if (url.pathname === "/session/capture-session/message") {
          const body = (await request.json()) as {
            parts: readonly { text: string }[];
          };
          prompts.push(body.parts[0]?.text ?? "");
          return Response.json({
            parts: [
              { type: "text", text: "STATUS: success\nSaved note abc123" },
            ],
          });
        }
        return Response.json(true);
      },
    });
    servers.push(server);
    const configPath = writeConfig(server.port!);
    process.env.OPENCODE_SERVER_PASSWORD = "secret";

    await expect(Effect.runPromise(captureStatus(configPath))).resolves.toEqual(
      {
        available: true,
      },
    );
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
    expect(
      Buffer.from(
        prompts[0]!.match(/<captured-note-base64>\n([^\n]+)/)![1]!,
        "base64",
      ).toString(),
    ).toContain("- Target repository: owner/repository");
    expect(prompts[0]).toContain(
      "The trusted target repository is owner/repository",
    );
  });

  test("rejects invalid input before contacting OpenCode", async () => {
    process.env.OPENCODE_SERVER_PASSWORD = "secret";
    const result = await Effect.runPromise(
      Effect.exit(
        processLocalCapture(writeConfig(1), {
          version: 1,
          requestId: crypto.randomUUID(),
          text: " ",
          capturedAt: new Date().toISOString(),
          source: "text",
        }),
      ),
    );

    expect(result._tag).toBe("Failure");
  });
});

function writeConfig(port: number): string {
  const root = mkdtempSync(join(tmpdir(), "notes-capture-"));
  roots.push(root);
  const path = join(root, "daemon.yml");
  writeFileSync(
    path,
    [
      "repository: owner/queue",
      "queueLabel: agent:ready",
      "workerId: desktop",
      "workerActor: worker",
      `opencodeUrl: http://127.0.0.1:${port}`,
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
  return path;
}
