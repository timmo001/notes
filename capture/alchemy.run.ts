/**
 * The capture Worker's infrastructure as an Alchemy stack: the `notes-capture`
 * Worker at capture.notes.timmo.dev, serving what `vite build` leaves in
 * `dist/`. Deploy it with `mise run capture:deploy`, which builds it first,
 * with the CAPTURE_* vars in the environment or the ignored
 * `capture/.env.prod`. CI gets them from the repository's secrets and
 * variables, which docs/stacks/github.ts writes from that file.
 */
// The secrets option is read synchronously, before any Effect runs
// oxlint-disable-next-line timmo-effect/prefer-platform-services
import { existsSync } from "node:fs";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "notes-capture",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
    // Not `.env`, which Wrangler would load into the Worker's dev vars and
    // types. CI has no file and sets the vars in the environment
    secrets: [
      Alchemy.Secrets.DotEnv(({ stage }) => ({
        path: existsSync(`.env.${stage}`) ? `.env.${stage}` : [],
      })),
    ],
  },
  Effect.gen(function* () {
    // Plain strings, so they stay plain vars as they were under Wrangler.
    // GITHUB_TOKEN stays a secret set outside the stack, which Alchemy leaves
    // alone
    const vars = yield* Config.all({
      ACCESS_AUD: Config.NonEmptyString("CAPTURE_ACCESS_AUD"),
      ACCESS_TEAM_DOMAIN: Config.NonEmptyString("CAPTURE_ACCESS_TEAM_DOMAIN"),
      CAPTURE_REPOSITORIES: Config.NonEmptyString("CAPTURE_REPOSITORIES"),
      GITHUB_OWNER: Config.NonEmptyString("CAPTURE_GITHUB_OWNER"),
      GITHUB_REPO: Config.NonEmptyString("CAPTURE_GITHUB_REPO"),
      QUEUE_LABEL: Config.NonEmptyString("CAPTURE_QUEUE_LABEL"),
    });

    // Made by Wrangler before this stack and found by its title, so it's
    // adopted rather than created. Nothing binds it today
    yield* Cloudflare.KV.Namespace("Session", {
      title: "notes-capture-session",
    }).pipe(Alchemy.AdoptPolicy.adopt(true));

    // The Cloudflare Vite plugin already bundles the Worker with the build's
    // version inlined, so it's uploaded as built. The Worker was deployed by
    // Wrangler before this stack, so it's adopted rather than failing as
    // someone else's
    const capture = yield* Cloudflare.Worker("Worker", {
      name: "notes-capture",
      main: "dist/notes_capture/index.js",
      bundle: false,
      assets: { directory: "dist/client", runWorkerFirst: true },
      domain: "capture.notes.timmo.dev",
      compatibility: { date: "2026-07-21", flags: ["nodejs_compat"] },
      env: vars,
    }).pipe(Alchemy.AdoptPolicy.adopt(true));

    return { url: capture.url };
  }),
);
