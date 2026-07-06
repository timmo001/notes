import { Context, Effect, Layer } from "effect";
import { CommandExecutor } from "../../services/CommandExecutor.js";

/** Service interface for emitting desktop notifications. */
export interface NotifierService {
  /** Send a best-effort desktop notification. Never fails. */
  readonly notify: (title: string, message: string) => Effect.Effect<void>;
}

/** Effect service for desktop notifications. */
export class Notifier extends Context.Service<Notifier, NotifierService>()(
  "Notifier",
) {
  /** Real notifier backed by `notify-send`. */
  static readonly layerNotifySend = Layer.effect(
    Notifier,
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      return {
        notify: (title, message) =>
          executor.exitCode("notify-send", [title, message]).pipe(
            Effect.catchCause(() => Effect.void),
            Effect.asVoid,
          ),
      };
    }),
  );

  /** No-op notifier for non-MCP paths. */
  static readonly layerNoop = Layer.succeed(Notifier, {
    notify: () => Effect.void,
  });
}
