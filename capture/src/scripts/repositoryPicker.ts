export const REPOSITORY_STORAGE_KEY = "notes-capture.repository";

export function filterRepositories(
  options: readonly { repository: string; searchText: string }[],
  query: string,
): readonly string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return options.flatMap(({ repository, searchText }) =>
    searchText.toLocaleLowerCase().includes(normalizedQuery)
      ? [repository]
      : [],
  );
}

export function restoreRepository(
  storedRepository: string | null,
  allowedRepositories: readonly string[],
): string {
  return storedRepository && allowedRepositories.includes(storedRepository)
    ? storedRepository
    : "";
}
