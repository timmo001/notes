import { Context, Layer } from "effect";
import { resolve } from "node:path";
import { ENV, envString } from "../lib/env.js";
import {
  defaultNotesRoot,
  expandHomePath,
  notesStateRoot,
} from "../lib/paths.js";

/** Runtime configuration for notes. */
export interface ConfigService {
  /** Path to the notes vault repository. */
  readonly notesDir: string;
  /** Directory whose project identity should be resolved. */
  readonly projectDir: string;
  /** Local state directory for checkout mappings and other machine data. */
  readonly stateDir: string;
}

/** Options for resolving configuration; omitted values come from the environment and defaults. */
export interface ConfigOptions {
  /** Absolute directory whose project identity should be resolved, such as a session's working directory. */
  readonly projectDir: string;
  /**
   * Notes vault path, resolved against `projectDir` when relative. Defaults to
   * `$NOTES`, then `$DOT_NOTES_DIR`, then `~/Documents/notes`.
   */
  readonly notesDir?: string;
  /** Local state directory. Defaults to `$XDG_STATE_HOME/notes`, then `~/.local/state/notes`. */
  readonly stateDir?: string;
}

/** Resolve notes configuration, filling omitted values from the environment and defaults. */
function resolveConfig(options: ConfigOptions): ConfigService {
  return {
    notesDir: resolve(
      options.projectDir,
      expandHomePath(
        options.notesDir ??
          envString(ENV.NOTES) ??
          envString(ENV.DOT_NOTES_DIR) ??
          defaultNotesRoot(),
      ),
    ),
    projectDir: options.projectDir,
    stateDir: options.stateDir ?? notesStateRoot(),
  };
}

/** Effect service for resolved notes configuration. */
export class Config extends Context.Service<Config, ConfigService>()("Config") {
  /** Resolve configuration for `options` without building a layer. */
  static readonly resolve = resolveConfig;

  /** Configuration for an explicit project directory, such as a host's session directory. */
  static readonly layerFor = (options: ConfigOptions): Layer.Layer<Config> =>
    Layer.sync(Config, () => resolveConfig(options));

  /** Configuration for the current working directory, as the CLI uses. */
  static readonly layer: Layer.Layer<Config> = Layer.sync(Config, () =>
    resolveConfig({ projectDir: process.cwd() }),
  );
}
