import { dirname, join } from "node:path";
import { Effect, FileSystem, Schema } from "effect";

type RepositoryDirectories = Record<string, string>;

const FILENAME = "repository-directories.json";

const RepositoryDirectoriesFile = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.String),
);

/** Read locally known source checkout directories by repository slug. */
export const readRepositoryDirectories = Effect.fn(
  "notes.repositoryDirectories.read",
)(function* (stateDir: string) {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.readFileString(join(stateDir, FILENAME)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(RepositoryDirectoriesFile)),
    Effect.orElseSucceed((): RepositoryDirectories => ({})),
  );
});

/** Remember the exact source checkout resolved for one repository scope. */
export const rememberRepositoryDirectory = Effect.fn(
  "notes.repositoryDirectories.remember",
)(function* (stateDir: string, repoSlug: string, directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = join(stateDir, FILENAME);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  const existing = yield* readRepositoryDirectories(stateDir);
  yield* fs.makeDirectory(dirname(path), { recursive: true });
  yield* fs.writeFileString(
    temporaryPath,
    `${JSON.stringify({ ...existing, [repoSlug]: directory }, null, 2)}\n`,
    { mode: 0o600 },
  );
  yield* fs.rename(temporaryPath, path);
});
