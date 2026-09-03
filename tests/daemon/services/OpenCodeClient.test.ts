import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Schema } from "effect";
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
  readonly body: Schema.Json | undefined;
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
    expect(requestPaths[0]).toBe("POST /api/session");
    expect(requestPaths).toContain("POST /api/session/ses_1/prompt");
    expect(requestPaths).toContain("POST /api/session/ses_1/wait");
    expect(requestPaths).toContain("GET /api/session/ses_1/permission");
    const interruptIndex = requestPaths.indexOf(
      "POST /api/session/ses_1/interrupt",
    );
    const deleteIndex = requestPaths.indexOf("DELETE /api/session/ses_1");
    expect(interruptIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(interruptIndex);
    expect(requests[0]?.auth).toBe(
      `Basic ${Buffer.from("opencode:secret").toString("base64")}`,
    );
    expect(requests[0]?.body).toMatchObject({
      agent: "notes-daemon",
      model: { providerID: "opencode", id: "big-pickle" },
      location: { directory: "/tmp/dotfiles" },
    });
    const messageRequest = requests.find(
      (request) =>
        request.method === "POST" &&
        request.path === "/api/session/ses_1/prompt",
    );
    expect(messageRequest?.body).toEqual({
      text: "prompt",
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
      "POST /api/session/ses_1/interrupt",
    );
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      "DELETE /api/session/ses_1",
    );
  });

  test("fails and cleans up when the session requests input", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { pendingForm: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result._tag).toBe("Failure");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      "POST /api/session/ses_1/interrupt",
    );
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      "DELETE /api/session/ses_1",
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
    expect(paths).toContain("POST /api/session/ses_1/interrupt");
    expect(paths).toContain("DELETE /api/session/ses_1");
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
      ({ method, path }) => method === "POST" && path === "/api/session",
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
    expect(paths).toContain("DELETE /api/session/ses_1");
    expect(paths).toContain("DELETE /api/session/ses_2");
  });

  test("includes the OpenCode error response when every model fails", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { failEveryMessage: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.flip((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(error).toMatchObject({
      operation: "process.models",
      message:
        "All models failed (opencode/big-pickle, github-copilot/gpt-5.6-sol/low): OpenCode returned 500: provider unavailable",
    });
  });

  test("uses a fresh fallback session after the agent reports failure", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { reportFirstFailure: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* (yield* OpenCodeClient).process("prompt");
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result).toBe("First\nSecond");
    expect(
      requests.filter(
        ({ method, path }) => method === "POST" && path === "/api/session",
      ),
    ).toHaveLength(2);
  });

  test("fails when every agent response omits a valid status", async () => {
    const requests: RecordedRequest[] = [];
    const server = makeServer(requests, { omitEveryStatus: true });
    const config = testConfig(`http://127.0.0.1:${server.port}`);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* Effect.exit((yield* OpenCodeClient).process("prompt"));
      }).pipe(Effect.provide(OpenCodeClient.layer(config, "secret"))),
    );

    expect(result._tag).toBe("Failure");
    expect(
      requests.filter(
        ({ method, path }) => method === "POST" && path === "/api/session",
      ),
    ).toHaveLength(2);
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
        ({ method, path }) => method === "POST" && path === "/api/session",
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
    expect(paths).toContain("DELETE /api/session/ses_1");
    expect(paths).toContain("DELETE /api/session/ses_2");
  });
});

function makeServer(
  requests: RecordedRequest[],
  options: {
    readonly pendingPermission?: boolean;
    readonly pendingForm?: boolean;
    readonly hangMessage?: boolean;
    readonly failFirstMessage?: boolean;
    readonly failEveryMessage?: boolean;
    readonly emptyEveryMessage?: boolean;
    readonly reportFirstFailure?: boolean;
    readonly omitEveryStatus?: boolean;
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
        body: text
          ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(text)
          : undefined,
      });
      if (request.method === "POST" && url.pathname === "/api/session") {
        const sessionNumber = requests.filter(
          ({ method, path }) => method === "POST" && path === "/api/session",
        ).length;
        return Response.json({ data: { id: `ses_${sessionNumber}` } });
      }
      if (/^\/api\/session\/ses_\d+\/permission$/.test(url.pathname))
        return Response.json({
          data: options.pendingPermission
            ? [{ sessionID: url.pathname.split("/")[3] }]
            : [],
        });
      if (/^\/api\/session\/ses_\d+\/form$/.test(url.pathname))
        return Response.json({
          data: options.pendingForm
            ? [{ sessionID: url.pathname.split("/")[3] }]
            : [],
        });
      if (
        request.method === "POST" &&
        /^\/api\/session\/ses_\d+\/prompt$/.test(url.pathname)
      ) {
        if (
          options.pendingPermission ||
          options.pendingForm ||
          options.hangMessage
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
        if (
          options.failEveryMessage ||
          (options.failFirstMessage &&
            url.pathname === "/api/session/ses_1/prompt")
        ) {
          return new Response("provider unavailable", { status: 500 });
        }
        if (options.emptyEveryMessage) {
          return Response.json({ parts: [{ type: "tool", text: "ignored" }] });
        }
        if (
          options.reportFirstFailure &&
          url.pathname === "/api/session/ses_1/prompt"
        ) {
          return Response.json({ data: { type: "user" } });
        }
        return Response.json({ data: { type: "user" } });
      }
      if (/^\/api\/session\/ses_\d+\/message$/.test(url.pathname)) {
        const session = url.pathname.split("/")[3];
        const content = options.emptyEveryMessage
          ? [{ type: "tool", text: "ignored" }]
          : options.reportFirstFailure && session === "ses_1"
            ? [{ type: "text", text: "STATUS: failure\nNo note written" }]
            : options.omitEveryStatus
              ? [{ type: "text", text: "No note written" }]
              : [
                  { type: "text", text: "STATUS: success\nFirst" },
                  { type: "tool", text: "ignored" },
                  { type: "text", text: "Second" },
                ];
        return Response.json({
          data: [{ type: "assistant", content }],
          cursor: { previous: null, next: null },
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
