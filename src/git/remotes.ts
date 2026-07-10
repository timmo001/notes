/** A resolved default remote plus the full list of configured remotes. */
export interface ResolvedRemote {
  /** Chosen remote name (upstream > origin > first available > origin). */
  readonly remote: string;
  /** All configured remote names, in `git remote` order. */
  readonly remotes: readonly string[];
}

/** Whether a remote owner or repository segment is safe for a filesystem path. */
export function isSafeRepositorySegment(value: string): boolean {
  return (
    value !== "." &&
    value !== ".." &&
    /^[A-Za-z0-9._-]+$/.test(value) &&
    !value.includes("\\")
  );
}

/** Parse an owner and repository from a Git SSH or URL remote. */
export function parseRepositoryRemoteUrl(
  remoteUrl: string,
): { readonly owner: string; readonly repo: string } | null {
  let path: string;
  const scpMatch = remoteUrl.match(/^[^@\s]+@[^:\s]+:(.+)$/);
  if (scpMatch?.[1]) {
    path = scpMatch[1];
  } else {
    try {
      path = new URL(remoteUrl).pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  const parts = decoded.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  return isSafeRepositorySegment(owner) && isSafeRepositorySegment(repo)
    ? { owner, repo }
    : null;
}

/** Resolve the default remote from `git remote` output. */
export function resolveDefaultRemote(remotesOutput: string): ResolvedRemote {
  const remotes = remotesOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const remote = remotes.includes("upstream")
    ? "upstream"
    : remotes.includes("origin")
      ? "origin"
      : remotes[0] || "origin";
  return { remote, remotes };
}

/** Parse `git symbolic-ref refs/remotes/<remote>/HEAD` output. */
export function parseDefaultBranch(ref: string, remote: string): string {
  const prefix = `refs/remotes/${remote}/`;
  if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  const parts = ref.split("/");
  return parts[parts.length - 1] || "main";
}
