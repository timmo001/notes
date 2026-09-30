import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";
import type { Redacted } from "effect";
import {
  parseRepositoryOptions,
  type RepositoryOption,
} from "./repositories.js";

export class InvalidRepositoryConfig extends Schema.TaggedError<InvalidRepositoryConfig>()(
  "InvalidRepositoryConfig",
  { cause: Schema.Defect() },
) {}

export interface CaptureConfigService {
  readonly access: {
    readonly audience: string;
    readonly teamDomain: string;
  };
  readonly github: {
    readonly owner: string;
    readonly repository: string;
    readonly token: Redacted.Redacted;
  };
  readonly queueLabel: string;
  /** Configured picker repositories, parsed once per isolate. */
  readonly repositories: Effect.Effect<
    readonly RepositoryOption[] | undefined,
    InvalidRepositoryConfig
  >;
}

export type CaptureEnv = Readonly<
  Record<
    | "ACCESS_AUD"
    | "ACCESS_TEAM_DOMAIN"
    | "GITHUB_OWNER"
    | "GITHUB_REPO"
    | "GITHUB_TOKEN"
    | "QUEUE_LABEL",
    string
  >
> & { readonly CAPTURE_REPOSITORIES?: string };

/** Capture settings read from the Worker environment. */
export class CaptureConfig extends Context.Service<
  CaptureConfig,
  CaptureConfigService
>()("notes-capture/CaptureConfig") {
  static layer(env: CaptureEnv) {
    return Layer.effect(
      CaptureConfig,
      Effect.gen(function* () {
        const config = yield* Config.all({
          audience: Config.NonEmptyString("ACCESS_AUD"),
          teamDomain: Config.NonEmptyString("ACCESS_TEAM_DOMAIN"),
          owner: Config.NonEmptyString("GITHUB_OWNER"),
          repository: Config.NonEmptyString("GITHUB_REPO"),
          token: Config.Redacted("GITHUB_TOKEN"),
          queueLabel: Config.NonEmptyString("QUEUE_LABEL"),
          repositories: Config.option(Config.String("CAPTURE_REPOSITORIES")),
        });

        const repositories = yield* Effect.try({
          try: () =>
            parseRepositoryOptions(Option.getOrUndefined(config.repositories)),
          catch: (cause) => new InvalidRepositoryConfig({ cause }),
        }).pipe(Effect.result);

        return CaptureConfig.of({
          access: { audience: config.audience, teamDomain: config.teamDomain },
          github: {
            owner: config.owner,
            repository: config.repository,
            token: config.token,
          },
          queueLabel: config.queueLabel,
          repositories: Effect.fromResult(repositories),
        });
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown(env),
        ),
      ),
    );
  }
}
