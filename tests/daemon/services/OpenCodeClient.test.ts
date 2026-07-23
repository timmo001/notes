import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OpenCodeClient } from "../../../src/daemon/services/OpenCodeClient.js";
import type { DaemonConfig } from "../../../src/daemon/schema.js";

const servers: Bun.Server<unknown>[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly auth: string | null;
  readonly directory: string | null;
  readonly body: unknown;
}

describe("OpenCodeClient", () => {
  test("uses the dedicated agent and cleans up the session", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests);
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* OpenCodeClient).process("prompt");
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result).toBe("First\nSecond");
    const requestPaths = requests.map(
      ({ method, path }) => `${method} ${path}`,
    );
    expect(requestPaths[0]).toBe("POST /session");
    expect(requestPaths).toContain("POST /session/session-1/message");
    expect(requestPaths).toContain("GET /permission");
    const abortIndex = requestPaths.indexOf("POST /session/session-1/abort");
    const deleteIndex = requestPaths.indexOf("DELETE /session/session-1");
    expect(abortIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(abortIndex);
    expect(requests[0]?.auth).toBe(
      `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
    );
    expect(
      requests.every((request) => request.directory === "/tmp/dotfiles"),
    ).toBe(true);
    expect(requests[0]?.body).toMatchObject({
      agent: "notes-daemon",
      model: { providerID: "opencode", id: "big-pickle" },
      permission: expect.arrayContaining([
        { permission: "question", pattern: "*", action: "deny" },
        { permission: "bash", pattern: "*", action: "deny" },
        { permission: "notes_note_delete", pattern: "*", action: "deny" },
        {
          permission: "external_directory",
          pattern: "~/repos/**",
          action: "allow",
        },
      ]),
    });
    const messageRequest = requests.find(
      (request) =>
        request.method === "POST" &&
        request.path === "/session/session-1/message",
    );
    expect(messageRequest?.body).toEqual({
      agent: "notes-daemon",
      parts: [{ type: "text", text: "prompt" }],
    });
  });

  test("fails and cleans up when the session requests permission", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { pendingPermission: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result._tag).toBe("Failure");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      "POST /session/session-1/abort",
    );
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      "DELETE /session/session-1",
    );
  });

  test("aborts and deletes a timed-out session", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { hangMessage: true });
    const config = {
      ...testConfig(`http://127.0.0.1:${server.port}`),
      sessionTimeoutSeconds: 0.05,
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result._tag).toBe("Failure");
    const paths = requests.map(({ method, path }) => `${method} ${path}`);
    expect(paths).toContain("POST /session/session-1/abort");
    expect(paths).toContain("DELETE /session/session-1");
  });

  test("uses a fresh fallback session after the primary request fails", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { failFirstMessage: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* OpenCodeClient).process("prompt");
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result).toBe("First\nSecond");
    const sessions = requests.filter(
      ({ method, path }) => method === "POST" && path === "/session",
    );
    expect(sessions.map(({ body }) => body)).toEqual([
      expect.objectContaining({
        model: { providerID: "opencode", id: "big-pickle" },
      }),
      expect.objectContaining({
        model: {
          providerID: "github-copilot",
          id: "gpt-5.6-sol",
          variant: "low",
        },
      }),
    ]);
    const paths = requests.map(({ method, path }) => `${method} ${path}`);
    expect(paths).toContain("DELETE /session/session-1");
    expect(paths).toContain("DELETE /session/session-2");
  });

  test("does not start a fallback session after primary success", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests);
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* OpenCodeClient).process("prompt");
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(
      requests.filter(
        ({ method, path }) => method === "POST" && path === "/session",
      ),
    ).toHaveLength(1);
  });

  test("cleans up every session when all models return no text", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { emptyEveryMessage: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result._tag).toBe("Failure");
    const paths = requests.map(({ method, path }) => `${method} ${path}`);
    expect(paths).toContain("DELETE /session/session-1");
    expect(paths).toContain("DELETE /session/session-2");
  });
});

function makeServer(
  requests: RecordedRequest[],
  options: {
    readonly pendingPermission?: boolean;
    readonly hangMessage?: boolean;
    readonly failFirstMessage?: boolean;
    readonly emptyEveryMessage?: boolean;
  } = {},
) {
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const text = await request.text();
      requests.push({
        method: request.method,
        path: url.pathname,
        auth: request.headers.get("Authorization"),
        directory: url.searchParams.get("directory"),
        body: text ? (JSON.parse(text) as unknown) : undefined,
      });
      if (request.method === "POST" && url.pathname === "/session") {
        const sessionNumber = requests.filter(
          ({ method, path }) => method === "POST" && path === "/session",
        ).length;
        return Response.json({ id: `session-${sessionNumber}` });
      }
      if (url.pathname === "/permission")
        return Response.json(
          options.pendingPermission
            ? [{ sessionID: "session-1" }, { sessionID: "session-2" }]
            : [],
        );
      if (url.pathname === "/question") return Response.json([]);
      if (
        request.method === "POST" &&
        /^\/session\/session-\d+\/message$/.test(url.pathname)
      ) {
        if (options.pendingPermission || options.hangMessage) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
        if (
          options.failFirstMessage &&
          url.pathname === "/session/session-1/message"
        ) {
          return new Response("provider unavailable", { status: 500 });
        }
        if (options.emptyEveryMessage) {
          return Response.json({ parts: [{ type: "tool", text: "ignored" }] });
        }
        return Response.json({
          parts: [
            { type: "text", text: "First" },
            { type: "tool", text: "ignored" },
            { type: "text", text: "Second" },
          ],
        });
      }
      return Response.json(true);
    },
  });
  servers.push(server);
  return server;
}

function testConfig(opencodeUrl: string): DaemonConfig {
  return {
    repository: "owner/repo",
    repositoryPath: "/tmp/repo",
    queueLabel: "agent:ready",
    workerId: "desktop",
    workerActor: "worker",
    opencodeUrl,
    opencodeDirectory: "/tmp/dotfiles",
    opencodeAgent: "notes-daemon",
    opencodeModels: [
      { providerID: "opencode", modelID: "big-pickle" },
      {
        providerID: "github-copilot",
        modelID: "gpt-5.6-sol",
        variant: "low",
      },
    ],
    allowedReadPaths: ["~/repos/**", "~/.config/dotfiles/**"],
    sessionTimeoutSeconds: 30,
    passTimeoutSeconds: 60,
    commandTimeoutSeconds: 5,
    consecutiveFailureLimit: 3,
    pollIntervalSeconds: 30,
  };
}
