import { formatLocalNoteDateTimeFromEpochSeconds } from "./time.js";

/** Parsed Git repository identity for repo-scoped notes. */
export interface RepoNoteIdentity {
  /** GitHub owner or organisation parsed from the selected remote. */
  readonly owner: string;
  /** GitHub repository name parsed from the selected remote. */
  readonly repo: string;
  /** Remote name used to resolve owner/repo. */
  readonly remote: string;
  /** Raw remote URL used to resolve owner/repo. */
  readonly remoteUrl: string;
}

/** Note priority level, highest urgency first when ranked. */
export type NotePriority = "low" | "medium" | "high" | "critical";

/** Grouping dimension applied to the notes list. */
export type NoteGroupMode = "none" | "priority";

/** Group modes cycled by the notes view grouping key, in order. */
export const GROUP_CYCLE: readonly NoteGroupMode[] = ["priority", "none"];

/** Priority levels ordered highest-first for display and sorting. */
export const PRIORITY_LEVELS: readonly NotePriority[] = [
  "critical",
  "high",
  "medium",
  "low",
];

/** Priority applied to notes that declare none. */
export const DEFAULT_NOTE_PRIORITY: NotePriority = "medium";

/** Frontmatter extracted from a note file. */
export interface NoteFrontmatter {
  /** Display title from frontmatter. */
  readonly name: string | null;
  /** One-line note description from frontmatter. */
  readonly description: string | null;
  /** Kebab-case tags parsed from frontmatter. */
  readonly tags: readonly string[];
  /** Note priority parsed from frontmatter, or null when absent/invalid. */
  readonly priority: NotePriority | null;
}

/** Repo note entry with file metadata and parsed frontmatter. */
export interface NoteEntry extends NoteFrontmatter {
  /** Markdown filename, relative to the repo notes directory. */
  readonly filename: string;
  /** Absolute note file path. */
  readonly filePath: string;
  /** Repository section slug (`owner/repo`) when listed across all repos. */
  readonly repoSlug?: string;
  /** Modification time in epoch seconds. */
  readonly mtime: number;
}

/** Notes grouped under one `repo-notes/<owner>/<repo>` directory. */
export interface NoteRepoSection {
  /** Repository slug used as the section heading. */
  readonly repoSlug: string;
  /** Absolute directory path for this repository's notes. */
  readonly notesPath: string;
  /** Note entries in this repository, sorted newest-first. */
  readonly entries: readonly NoteEntry[];
}

/** Filter applied when opening the interactive notes view. */
export interface NotesViewFilter {
  /** Tag that note entries must contain, compared case-insensitively. */
  readonly tag?: string;
  /** Display title used for filtered views such as Handoffs. */
  readonly title?: string;
  /** Show notes from every repository note directory instead of only the current repo. */
  readonly includeAllRepos?: boolean;
}

/** Options for rendering note context. */
export interface NoteContextOptions {
  /** OpenCode command name that requested context. */
  readonly command: string;
}

/** Structured context payload consumed by the dotfiles OpenCode plugin. */
export interface NoteContextPayload {
  readonly generatedAt: string;
  readonly command: string;
  readonly notesRoot: string;
  readonly repoNotesRoot: string;
  readonly repository?: RepoNoteIdentity;
  readonly notesPath?: string;
  readonly notesExist?: boolean;
  readonly entries: readonly NoteEntry[];
  readonly contents?: readonly NoteContent[];
  readonly warnings: readonly string[];
  readonly error?: { readonly message: string; readonly detail?: string };
}

/** Full content included for note-reference context payloads. */
export interface NoteContent {
  readonly filename: string;
  readonly filePath: string;
  readonly content: string;
}

/** Result of a best-effort git commit after note I/O. */
export interface NoteCommitResult {
  /** Whether the commit step completed or had nothing to commit. */
  readonly ok: boolean;
  /** Command output when available. */
  readonly text?: string;
  /** Non-fatal error message when commit failed. */
  readonly error?: string;
}

/** Outcome of the best-effort push after a note mutation. */
export interface NotePushResult {
  /** Whether the push completed. */
  readonly ok: boolean;
  /** Human summary of what was pushed. */
  readonly message: string;
  /** Non-fatal error message when the push did not complete. */
  readonly error?: string;
}

/** Result returned after writing a note file. */
export interface NoteWriteResult {
  /** Absolute path written. */
  readonly path: string;
  /** Markdown output suitable for tool display. */
  readonly output: string;
  /** Git commit outcome for the write. */
  readonly commit: NoteCommitResult;
  /** Best-effort push outcome, or undefined when the vault has no remote. */
  readonly push?: NotePushResult;
}

/** Result returned after deleting a note file. */
export interface NoteDeleteResult {
  /** Absolute path deleted. */
  readonly path: string;
  /** Markdown output suitable for tool display. */
  readonly output: string;
  /** Git commit outcome for the deletion. */
  readonly commit: NoteCommitResult;
  /** Best-effort push outcome, or undefined when the vault has no remote. */
  readonly push?: NotePushResult;
}

/** Kind of note to create via the add-item flow. */
export type NoteCreateKind = "note" | "handoff";

/** Draft note returned after initial file creation before editor launch. */
export interface NoteCreateDraft {
  /** The NoteEntry for the newly created draft file. */
  readonly entry: NoteEntry;
  /** The initial seed content written to the file. */
  readonly content: string;
}

/** Supported notes list output formats. */
export type NotesListFormat = "labels" | "json";

/** Render a note label in the repo-note context format. */
export function formatNoteLabel(entry: NoteEntry): string {
  const date = formatLocalNoteDateTimeFromEpochSeconds(entry.mtime);
  const tagPart = entry.tags.length ? ` [tags: ${entry.tags.join(", ")}]` : "";

  if (entry.name && entry.description) {
    return `${entry.filename} - ${entry.name}: ${entry.description}${tagPart} (last modified: ${date})`;
  }

  if (entry.name) {
    return `${entry.filename} - ${entry.name}${tagPart} (last modified: ${date})`;
  }

  return `${entry.filename}${tagPart} (last modified: ${date})`;
}

/** Render repo-grouped note labels with Markdown-style section headings. */
export function formatNoteSections(
  sections: readonly NoteRepoSection[],
): string {
  return sections
    .map((section) =>
      [`## ${section.repoSlug}`, ...section.entries.map(formatNoteLabel)].join(
        "\n",
      ),
    )
    .join("\n\n");
}

/** Parse a frontmatter priority value, returning null when unrecognised. */
export function parseNotePriority(value: string): NotePriority | null {
  const normalised = value
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase();
  return PRIORITY_LEVELS.includes(normalised as NotePriority)
    ? (normalised as NotePriority)
    : null;
}

/** Resolve an entry's effective priority, defaulting absent values to medium. */
export function notePriority(entry: NoteEntry): NotePriority {
  return entry.priority ?? DEFAULT_NOTE_PRIORITY;
}

/** Render a priority as a capitalised display label. */
export function priorityLabel(priority: NotePriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

/** Rank a priority for sorting, highest urgency first. */
export function priorityRank(priority: NotePriority): number {
  return PRIORITY_LEVELS.indexOf(priority);
}

/** Whether a note entry is tagged as a handoff. */
export function isHandoff(entry: NoteEntry): boolean {
  return entry.tags.some((tag) => tag.toLowerCase() === "handoff");
}
