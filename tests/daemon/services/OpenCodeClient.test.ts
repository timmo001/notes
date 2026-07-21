import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OpenCodeClient } from "../../../src/daemon/services/OpenCodeClient.js";
import type { DaemonConfig } from "../../../src/daemon/schema.js";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

describe("OpenCodeClient", () => {
  test("creates a session and returns assistant text with basic auth", async () => {
    const requests: Array<{
      path: string;
      auth: string | null;
      directory: string | null;
      body: unknown;
    }> = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        requests.push({
          path: url.pathname,
          auth: request.headers.get("Authorization"),
          directory: url.searchParams.get("directory"),
          body: await request.json(),
        });
        if (url.pathname === "/session")
          return Response.json({ id: "session-1" });
        return Response.json({
          parts: [
            { type: "text", text: "First" },
            { type: "tool", text: "ignored" },
            { type: "text", text: "Second" },
          ],
        });
      },
    });
    servers.push(server);
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* OpenCodeClient).process("prompt");
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result).toBe("First\nSecond");
    expect(requests.map((request) => request.path)).toEqual([
      "/session",
      "/session/session-1/message",
    ]);
    expect(requests[0]?.auth).toBe(
      `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
    );
    expect(
      requests.every((request) => request.directory === "/tmp/dotfiles"),
    ).toBe(true);
    expect(requests[0]?.body).toMatchObject({
      permission: [{ permission: "*", pattern: "*", action: "deny" }],
    });
    expect(requests[1]?.body).toMatchObject({
      tools: { "*": false, notes_note_write: true, github_web_search: true },
    });
  });
});

function testConfig(opencodeUrl: string): DaemonConfig {
  return {
    repository: "owner/repo",
    repositoryPath: "/tmp/repo",
    queueLabel: "agent:ready",
    workerId: "desktop",
    workerActor: "worker",
    opencodeUrl,
    opencodeDirectory: "/tmp/dotfiles",
    pollIntervalSeconds: 30,
  };
}
