/**
 * The credentials and settings CI deploys the docs and capture stacks with, as
 * code: a Cloudflare token scoped to what those stacks touch, and the capture
 * Worker's vars from the ignored `capture/.env.prod`, written into the
 * repository's Actions secrets and variables. Deploy it once, and again to
 * rotate the token or change a var: `mise run docs:deploy:github`.
 */
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const repository = { owner: "timmo001", repository: "notes" };

export default Alchemy.Stack(
  "notes-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
    secrets: [Alchemy.Secrets.DotEnv({ path: "../capture/.env.prod" })],
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const account = `com.cloudflare.api.account.${accountId}` as const;

    const token = yield* Cloudflare.ApiToken.AccountApiToken("DeployToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Workers KV Storage Write",
            "Account Settings Read",
            "Secrets Store Write",
          ],
          resources: { [account]: "*" },
        },
        {
          effect: "allow",
          permissionGroups: ["Zone Read", "DNS Write", "Workers Routes Write"],
          resources: {
            [account]: { "com.cloudflare.api.account.zone.*": "*" },
          },
        },
      ],
    });

    yield* GitHub.Secret("ApiTokenSecret", {
      ...repository,
      name: "CLOUDFLARE_API_TOKEN",
      value: token.value,
    });

    yield* GitHub.Secret("AccountIdSecret", {
      ...repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    // The capture vars that name private repositories stay secret; the rest
    // are variables, so their values aren't masked out of the deploy log
    yield* GitHub.Secrets({
      ...repository,
      secrets: yield* Config.all({
        CAPTURE_ACCESS_AUD: Config.Redacted("CAPTURE_ACCESS_AUD"),
        CAPTURE_GITHUB_REPO: Config.Redacted("CAPTURE_GITHUB_REPO"),
        CAPTURE_REPOSITORIES: Config.Redacted("CAPTURE_REPOSITORIES"),
      }),
    });

    for (const name of [
      "CAPTURE_ACCESS_TEAM_DOMAIN",
      "CAPTURE_GITHUB_OWNER",
      "CAPTURE_QUEUE_LABEL",
    ]) {
      yield* GitHub.Variable(name, {
        ...repository,
        name,
        value: yield* Config.NonEmptyString(name),
      });
    }
  }),
);
