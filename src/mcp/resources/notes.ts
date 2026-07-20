import { Effect, Schema } from "effect";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { renderHelp } from "../../cli/help.js";
import { nativeCommandNames } from "../../cli/spec.js";
import { Notes } from "../../notes/services/Notes.js";

const commandParam = McpSchema.param("name", Schema.String);
const CONTEXT_COMMAND = "notes-list";

/** Register notes read-only resources on the current MCP server. */
export const registerNotesResources = Effect.gen(function* () {
  yield* McpServer.registerResource({
    uri: "notes://context",
    name: "project note context",
    description:
      "The current project's note context: project identity, notes path, and recent notes.",
    mimeType: "text/markdown",
    content: Effect.gen(function* () {
      const notes = yield* Notes;
      return yield* notes.context({ command: CONTEXT_COMMAND });
    }),
  });

  yield* McpServer.registerResource`notes://command/${commandParam}`({
    name: "notes command help",
    description: "Help text for a single notes command.",
    mimeType: "text/plain",
    completion: {
      name: (input) =>
        Effect.succeed(
          [...nativeCommandNames]
            .filter((name) => name.startsWith(input))
            .sort(),
        ),
    },
    content: (_uri, name) => Effect.sync(() => renderHelp(name)),
  });
});
