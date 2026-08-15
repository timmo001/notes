import { Effect } from "effect";
import { loadDaemonConfig } from "../daemon/config.js";
import { issuePrompt } from "../daemon/schema.js";
import { OpenCodeClient } from "../daemon/services/OpenCodeClient.js";
import { captureBody } from "./prompt.js";
import { decodeCapture } from "./schema.js";

const MAX_RESULT_LENGTH = 20_000;

/** Check whether the configured local OpenCode processor accepts requests. */
export const captureStatus = Effect.fn("NotesCapture.status")(function* (
  configPath: string,
) {
  const client = yield* captureClient(configPath);
  yield* client.status;
  return { available: true as const };
});

/** Validate and process one capture directly through local OpenCode. */
export const processLocalCapture = Effect.fn("NotesCapture.process")(function* (
  configPath: string,
  input: unknown,
) {
  const capture = yield* Effect.try(() => decodeCapture(input));
  const client = yield* captureClient(configPath);
  const summary = yield* client.process(
    issuePrompt(captureBody(capture), 16_384, capture.repository),
  );
  if (!summary || summary.length > MAX_RESULT_LENGTH) {
    return yield* Effect.fail("OpenCode returned invalid result text");
  }
  return { status: "success" as const, requestId: capture.requestId, summary };
});

const captureClient = Effect.fn("NotesCapture.client")(function* (
  configPath: string,
) {
  const config = yield* loadDaemonConfig(configPath);
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password)
    return yield* Effect.fail("OPENCODE_SERVER_PASSWORD is not set");
  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const client = yield* OpenCodeClient.pipe(
    Effect.provide(OpenCodeClient.layer(config, password, username)),
  );
  return client;
});
