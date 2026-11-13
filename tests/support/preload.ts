import { setDefaultTimeout } from "bun:test";

// The fixtures spawn several git processes, and `mise run check` runs the
// whole suite alongside lint, type-checks and builds, so a test that takes
// about 300ms alone can pass the 5s default on a busy machine.
setDefaultTimeout(30_000);

// Git config passed in the environment, such as the url.insteadOf rewrites a
// CI runner or Upkeep's worker sets, would change what the fixture repositories
// report, so tests only see the config their own fixtures write.
for (const key of Object.keys(process.env)) {
  if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key))
    delete process.env[key];
}
