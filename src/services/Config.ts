import { Context, Effect, Layer } from "effect";
import { resolve } from "node:path";
import { ENV, envString } from "../lib/env.js";
import { defaultNotesRoot, expandHomePath } from "../lib/paths.js";

/** Runtime configuration for the standalone notes CLI. */
export interface ConfigService {
  /** Path to the notes vault repository. */
  readonly notesDir: string;
}

/** Effect service for resolved notes configuration. */
export class Config extends Context.Service<Config, ConfigService>()("Config") {
  static readonly layer = Layer.effect(
    Config,
    Effect.sync(() => ({
      notesDir: resolve(
        expandHomePath(
          envString(ENV.NOTES) ??
            envString(ENV.DOT_NOTES_DIR) ??
            defaultNotesRoot(),
        ),
      ),
    })),
  );
}
