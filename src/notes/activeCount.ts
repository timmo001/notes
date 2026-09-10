import { HerdrSdk } from "@herdr/sdk";
import { Effect, Layer, Option } from "effect";
import { Config } from "../services/Config.js";
import { Notes } from "./services/Notes.js";

/** Count notes in the focused Herdr pane's project, including handoffs. */
export const activeNoteCount = Effect.fn("activeNoteCount")(function* () {
  const sdk = yield* HerdrSdk;
  const snapshot = yield* sdk.session.snapshot();
  const pane = snapshot.panes.find(
    (pane) => pane.id === Option.getOrNull(snapshot.focusedPaneId),
  );
  if (!pane) return null;
  const cwd = Option.getOrNull(
    Option.orElse(pane.foregroundCwd, () => pane.cwd),
  );
  if (!cwd) return null;

  const config = yield* Config;
  const count = yield* Effect.gen(function* () {
    return (yield* (yield* Notes).list()).length;
  }).pipe(
    Effect.provide(
      Notes.layer.pipe(
        Layer.provide(Layer.succeed(Config, { ...config, projectDir: cwd })),
      ),
      { local: true },
    ),
  );
  return { workspaceId: pane.workspaceId, paneId: pane.id, cwd, count };
});
