import { Effect, FileSystem, Schema } from "effect";
import { parse } from "yaml";
import { expandHomePath } from "../lib/paths.js";
import {
  DaemonConfig,
  type DaemonConfig as DaemonConfigValue,
} from "./schema.js";

/** Load and validate daemon YAML configuration. */
export const loadDaemonConfig = Effect.fn("NotesDaemon.loadConfig")(function* (
  filePath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const content = yield* fs.readFileString(expandHomePath(filePath));

  const value = yield* Effect.try(() => parse(content));
  const decoded = yield* Schema.decodeUnknownEffect(DaemonConfig)(value);

  return {
    ...decoded,
    opencodeCommand: expandHomePath(decoded.opencodeCommand ?? "opencode2"),
    opencodeArgs: decoded.opencodeArgs ?? [],
    opencodeDirectory: expandHomePath(decoded.opencodeDirectory),
    allowedReadPaths: decoded.allowedReadPaths.map(expandHomePath),
  } satisfies DaemonConfigValue;
});
