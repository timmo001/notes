import type { NoteGitResult } from "./types.js";

export interface NoteGitOutcome {
  readonly complete: boolean;
  readonly detail: string;
}

/** Summarise whether a local note mutation was committed and pushed. */
export function noteGitOutcome(result: NoteGitResult): NoteGitOutcome {
  if (!result.commit.ok) {
    return {
      complete: false,
      detail: `saved locally but git commit failed: ${result.commit.error ?? "unknown error"}`,
    };
  }
  if (result.push && !result.push.ok) {
    return {
      complete: false,
      detail: `committed locally but push failed: ${result.push.error ?? "unknown error"}`,
    };
  }
  return {
    complete: true,
    detail: result.push?.message ?? "saved locally",
  };
}
