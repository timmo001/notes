export const REPOSITORY_STORAGE_KEY = "notes-capture.repository";

export function restoreRepository(
  storedRepository: string | null,
  allowedRepositories: readonly string[],
): string {
  return storedRepository && allowedRepositories.includes(storedRepository)
    ? storedRepository
    : "";
}
