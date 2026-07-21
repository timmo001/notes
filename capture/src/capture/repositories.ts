import { Schema } from "effect";

const Repository = Schema.String.check(Schema.isPattern(/^[^/\s]+\/[^/\s]+$/));

const RepositoryOption = Schema.Struct({
  label: Schema.Trimmed.check(Schema.isNonEmpty()),
  repository: Repository,
});

const RepositoryOptions = Schema.Array(RepositoryOption);

export type RepositoryOption = typeof RepositoryOption.Type;

export function parseRepositoryOptions(
  raw: string | undefined,
): readonly RepositoryOption[] | undefined {
  if (!raw) return undefined;

  const options = Schema.decodeUnknownSync(RepositoryOptions)(JSON.parse(raw));
  if (options.length === 0) return undefined;

  const repositories = new Set(options.map((option) => option.repository));
  if (repositories.size !== options.length) {
    throw new Error("Capture repositories contain duplicates");
  }
  return options;
}

export function resolveRepository(
  selectedRepository: string | undefined,
  defaultRepository: string,
  options: readonly RepositoryOption[] | undefined,
): string {
  if (
    selectedRepository === undefined ||
    selectedRepository === defaultRepository
  ) {
    return defaultRepository;
  }
  if (options?.some(({ repository }) => repository === selectedRepository)) {
    return selectedRepository;
  }
  throw new Error("Capture repository is not allowed");
}

export function splitRepository(repository: string): readonly [string, string] {
  const separator = repository.indexOf("/");
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error("Capture repository is invalid");
  }
  return [repository.slice(0, separator), repository.slice(separator + 1)];
}
