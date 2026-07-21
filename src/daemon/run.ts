import { Effect, Layer, Schedule } from "effect";
import { runProcessingPass } from "./coordinator.js";
import { loadDaemonConfig } from "./config.js";
import { IssueQueue } from "./services/IssueQueue.js";
import { OpenCodeClient } from "./services/OpenCodeClient.js";
import { RepositoryLock } from "./services/RepositoryLock.js";
import { CommandExecutor } from "../services/CommandExecutor.js";

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
    RepositoryLock.layer(config),
    OpenCodeClient.layer(config, password, username),
  ).pipe(Layer.provide(CommandExecutor.layer));
  const pass = runProcessingPass(config.queueLabel, config.workerActor).pipe(
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
  return yield* pass.pipe(
    Effect.catch((error) =>
      Effect.sync(() => console.error("[notes-daemon] pass failed", error)),
    ),
    Effect.repeat(
      Schedule.spaced(`${config.pollIntervalSeconds} seconds`).pipe(
        Schedule.jittered,
      ),
    ),
  );
});
