import { join } from "node:path";
import { ENV, envString } from "./env.js";

/** Current user's home directory path used by notes. */
export const HOME_DIR =
  envString(ENV.HOME) ?? `/home/${envString(ENV.USER) ?? ""}`;

/** Expand a leading `~` segment to the current user's home directory. */
export function expandHomePath(path: string): string {
  return path.replace(/^~(?=\/|$)/, HOME_DIR);
}

/** Default notes vault location. */
export function defaultNotesRoot(): string {
  return join(HOME_DIR, "Documents", "notes");
}
