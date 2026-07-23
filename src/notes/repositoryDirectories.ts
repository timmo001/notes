import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type RepositoryDirectories = Record<string, string>;

const FILENAME = "repository-directories.json";

/** Read locally known source checkout directories by repository slug. */
export function readRepositoryDirectories(
  stateDir: string,
): RepositoryDirectories {
  try {
    const value = JSON.parse(
      readFileSync(join(stateDir, FILENAME), "utf8"),
    ) as unknown;
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
