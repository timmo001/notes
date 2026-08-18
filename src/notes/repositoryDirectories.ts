import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Option, Schema } from "effect";

type RepositoryDirectories = Record<string, string>;

const FILENAME = "repository-directories.json";
const RepositoryDirectoriesFile = Schema.Record(Schema.String, Schema.String);

/** Read locally known source checkout directories by repository slug. */
export function readRepositoryDirectories(
  stateDir: string,
): RepositoryDirectories {
  try {
    return Option.getOrElse(
      Schema.decodeUnknownOption(RepositoryDirectoriesFile)(
        JSON.parse(readFileSync(join(stateDir, FILENAME), "utf8")),
      ),
      () => ({}),
    );
  } catch {
    return {};
  }
}

/** Remember the exact source checkout resolved for one repository scope. */
export function rememberRepositoryDirectory(
  stateDir: string,
  repoSlug: string,
  directory: string,
): void {
  const path = join(stateDir, FILENAME);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({ ...readRepositoryDirectories(stateDir), [repoSlug]: directory }, null, 2)}\n`,
    { mode: 0o600 },
  );
  renameSync(temporaryPath, path);
}
