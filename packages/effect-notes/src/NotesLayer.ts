import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";
import { Config, type ConfigOptions } from "./services/Config.js";
import { CommandExecutor } from "./services/CommandExecutor.js";
import { Notes } from "./notes/services/Notes.js";

/** Ready-made layers for running notes in-process. */
export const NotesLayer = {
  /**
   * {@link Notes} for an explicit project directory, with configuration,
   * command execution and Node platform services included. Omitted
   * `notesDir` and `stateDir` come from the environment and defaults.
   */
  make: (options: ConfigOptions): Layer.Layer<Notes> =>
    Notes.layer.pipe(
      Layer.provide(CommandExecutor.layer),
      Layer.provide(Config.layerFor(options)),
      Layer.provide(NodeServices.layer),
    ),
};
