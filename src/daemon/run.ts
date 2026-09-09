import { Effect, Layer, Ref, Schedule } from "effect";
import { layer as ghLayer } from "@timmo001/effect-gh";
import { runProcessingPass } from "./coordinator.js";
import { loadDaemonConfig } from "./config.js";
import { IssueQueue } from "./services/IssueQueue.js";
import { OpenCodeClient } from "./services/OpenCodeClient.js";

/** Load daemon configuration and run one pass or the supervised polling loop. */
export const runDaemon = Effect.fn("NotesDaemon.run")(function* (
  configPath: string,
  once: boolean,
) {
  const config = yield* loadDaemonConfig(configPath);
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password)
    return yield* Effect.fail("OPENCODE_SERVER_PASSWORD is not set");
  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const layers = Layer.mergeAll(
    IssueQueue.layer(config),
    OpenCodeClient.layer(config, password, username),
  ).pipe(Layer.provide(ghLayer()));
  const pass = runProcessingPass(config.queueLabel, config.workerActor).pipe(
    Effect.timeout(`${config.passTimeoutSeconds} seconds`),
    Effect.tap((result) =>
      Effect.sync(() =>
        console.log(
          `[notes-daemon] observed=${result.observed} completed=${result.completed} skipped=${result.skipped} failed=${result.failed}`,
        ),
      ),
    ),
    Effect.provide(layers),
  );

  if (once) return yield* pass;
  const consecutiveFailures = yield* Ref.make(0);
  const supervisedPass = pass.pipe(
    Effect.tap(() => Ref.set(consecutiveFailures, 0)),
    Effect.catch((error) =>
      Effect.gen(function* () {
        console.error("[notes-daemon] pass failed", error);
        const failures = yield* Ref.updateAndGet(
          consecutiveFailures,
          (count) => count + 1,
        );
        if (failures >= config.consecutiveFailureLimit) return yield* error;
      }),
    ),
  );
  return yield* supervisedPass.pipe(
    Effect.repeat(
      Schedule.spaced(`${config.pollIntervalSeconds} seconds`).pipe(
        Schedule.jittered,
      ),
    ),
  );
});
