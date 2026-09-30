import { Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { getRepositories, postCapture } from "./api/captures.js";
import { CaptureConfig } from "./capture/config.js";
import { AccessMiddleware } from "./capture/services/AccessAuth.js";
import { GitHubIssues } from "./capture/services/GitHubIssues.js";

function makeApp(env: Env) {
  const serveAsset = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const webRequest = yield* HttpServerRequest.toWeb(request);

    return HttpServerResponse.fromWeb(
      yield* Effect.promise(() => env.ASSETS.fetch(webRequest)),
    );
  });

  const services = GitHubIssues.layer.pipe(
    Layer.provideMerge(CaptureConfig.layer(env)),
    Layer.provide(FetchHttpClient.layer),
  );

  return Layer.mergeAll(
    Layer.mergeAll(
      HttpRouter.add("POST", "/api/captures", postCapture),
      HttpRouter.add("GET", "/api/repositories", getRepositories),
    ).pipe(HttpRouter.provideRequest(services)),
    HttpRouter.add("*", "/*", serveAsset),
    AccessMiddleware.pipe(Layer.provide(services)),
  );
}

const makeHandler = (env: Env) =>
  HttpRouter.toWebHandler(makeApp(env), { disableLogger: true });

let app: ReturnType<typeof makeHandler> | undefined;

export default {
  fetch(request: Request, env: Env) {
    app ??= makeHandler(env);

    return app.handler(request);
  },
} satisfies ExportedHandler<Env>;
