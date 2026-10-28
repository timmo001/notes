/**
 * Effect services for repository-scoped Markdown notes, the library behind
 * the `notes` CLI, TUI and MCP server.
 *
 * @module
 */
export { Config } from "./services/Config.js";

export type { ConfigOptions, ConfigService } from "./services/Config.js";

export { CommandError, CommandExecutor } from "./services/CommandExecutor.js";

export type { CommandExecutorService } from "./services/CommandExecutor.js";

export { Notes, NotesError } from "./notes/services/Notes.js";

export type { NotesService } from "./notes/services/Notes.js";

export { NotesLayer } from "./NotesLayer.js";

export * from "./notes/operations.js";

export * from "./notes/types.js";

export { noteGitOutcome } from "./notes/gitOutcome.js";

export type { NoteGitOutcome } from "./notes/gitOutcome.js";

export { searchNoteEntries } from "./notes/search.js";

export { formatLocalNoteDateTimeFromEpochSeconds } from "./notes/time.js";

export { renderDraft } from "./notes/frontmatter.js";

export type { DraftFrontmatter } from "./notes/frontmatter.js";

export { ENV, envString } from "./lib/env.js";

export { HOME_DIR, expandHomePath } from "./lib/paths.js";
