import { Context, Effect, Layer } from "effect";
import type { CliRenderer } from "@opentui/core";
import type { Theme } from "../theme.js";

let suppressNextDestroyExit = false;

/** Destroy the renderer without exiting the process, for handoff to a CLI command. */
export function destroyRendererForCommand(renderer: CliRenderer): void {
  try {
    suppressNextDestroyExit = true;
    renderer.destroy();
  } catch (error) {
    suppressNextDestroyExit = false;
    throw error;
  }
}

/** Effect service wrapping the OpenTUI CLI renderer with scoped lifecycle. */
export class Renderer extends Context.Service<Renderer, CliRenderer>()(
  "Renderer",
) {
  /** Create a renderer layer for TUI mode. */
  static layer(theme: Theme, nativeLibPath?: string) {
    return Layer.effect(
      Renderer,
      Effect.acquireRelease(
        Effect.promise(async () => {
          const { createCliRenderer, setRenderLibPath } =
            await import("@opentui/core");
          if (nativeLibPath) setRenderLibPath(nativeLibPath);
          return createCliRenderer({
            exitOnCtrlC: true,
            screenMode: "alternate-screen",
            useMouse: true,
            autoFocus: true,
            backgroundColor: theme.transparent ? "transparent" : theme.bg,
            onDestroy: () => {
              const shouldExit = !suppressNextDestroyExit;
              suppressNextDestroyExit = false;
              if (shouldExit) process.exit(0);
            },
          });
        }),
        (renderer) =>
          Effect.sync(() => {
            renderer.destroy();
          }),
      ),
    );
  }
}
