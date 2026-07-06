import { Effect, Layer, Logger } from "effect";
import { NodeStdio } from "@effect/platform-node";
import { McpServer } from "effect/unstable/ai";
import { Notifier } from "./services/Notifier.js";
import { registerNotesResources } from "./resources/notes.js";
import { registerNotesTools } from "./tools/notes.js";

const SERVER_NAME = "notes";
const SERVER_VERSION = "0.1.0";

const registerAll = Effect.gen(function* () {
  yield* registerNotesTools;
  yield* registerNotesResources;
});

/** Fully composed MCP server layer. */
export const McpServerLayer = Layer.effectDiscard(registerAll).pipe(
  Layer.provide(Notifier.layerNotifySend),
  Layer.provide(
    McpServer.layerStdio({ name: SERVER_NAME, version: SERVER_VERSION }),
  ),
  Layer.provide(NodeStdio.layer),
  Layer.provide(Layer.succeed(Logger.LogToStderr)(true)),
);
