import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Effect } from "effect";
import {
  readRepositoryDirectories,
  rememberRepositoryDirectory,
} from "../../src/notes/repositoryDirectories.js";
import { createTempDirectory, runScoped } from "../support/platform.js";

describe("repository directories", () => {
  test("persists exact checkout paths by repository slug", async () => {
    const stateDir = await createTempDirectory("notes-state-");
    const first = join(stateDir, "first-checkout");
    const second = join(stateDir, "second-checkout");

    const directories = await runScoped(
      Effect.gen(function* () {
        yield* rememberRepositoryDirectory(stateDir, "owner/first", first);
        yield* rememberRepositoryDirectory(stateDir, "owner/second", second);

        return yield* readRepositoryDirectories(stateDir);
      }),
    );

    expect(directories).toEqual({
      "owner/first": first,
      "owner/second": second,
    });
  });
});
