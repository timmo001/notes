import properLockfile from "proper-lockfile";

/** Acquire a cross-process lock for one notes vault. */
export function acquireVaultLock(
  notesRoot: string,
): Promise<() => Promise<void>> {
  return properLockfile.lock(notesRoot, {
    realpath: true,
    stale: 30_000,
    update: 10_000,
    retries: {
      retries: 60,
      factor: 1,
      minTimeout: 500,
      maxTimeout: 500,
      randomize: true,
    },
  });
}
