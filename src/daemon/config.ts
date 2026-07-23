import { Effect, Schema } from "effect";
import { readFile } from "node:fs/promises";
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
  const content = yield* Effect.promise(() =>
    readFile(expandHomePath(filePath), "utf8"),
  );
  const value = yield* Effect.try(() => parse(content));
  const decoded = yield* Schema.decodeUnknownEffect(DaemonConfig)(value);
  return {
    ...decoded,
    opencodeDirectory: expandHomePath(decoded.opencodeDirectory),
    allowedReadPaths: decoded.allowedReadPaths.map(expandHomePath),
  } satisfies DaemonConfigValue;
});
