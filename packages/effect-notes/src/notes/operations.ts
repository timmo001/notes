import { Effect } from "effect";
import { searchNoteEntries } from "./search.js";
import { Notes, type NotesError } from "./services/Notes.js";
import {
  isHandoff,
  notePriority,
  priorityRank,
  type NoteContextPayload,
  type NoteCreateKind,
  type NoteCreateResult,
  type NoteDeleteResult,
  type NoteEntry,
  type NoteGitResult,
  type NoteMoveResult,
  type NotePriority,
  type NoteReadResult,
  type NoteRepoSection,
  type NoteWriteResult,
} from "./types.js";

/** Whether a note has `tag`, compared case-insensitively. */
export function noteHasTag(entry: NoteEntry, tag: string): boolean {
  const wanted = tag.toLowerCase();

  return entry.tags.some((current) => current.toLowerCase() === wanted);
}

/** Keep the notes that have `tag`, or every note when `tag` is omitted. */
export function filterNotesByTag(
  entries: readonly NoteEntry[],
  tag: string | undefined,
): readonly NoteEntry[] {
  return tag ? entries.filter((entry) => noteHasTag(entry, tag)) : entries;
}

/** Keep the notes that have `tag` in each section, dropping sections left empty. */
export function filterSectionsByTag(
  sections: readonly NoteRepoSection[],
  tag: string | undefined,
): readonly NoteRepoSection[] {
  if (!tag) return sections;

  return sections.flatMap((section) => {
    const entries = section.entries.filter((entry) => noteHasTag(entry, tag));

    return entries.length > 0 ? [{ ...section, entries }] : [];
  });
}

/** Sort handoffs by priority, most urgent first, then newest first. */
export function sortHandoffs(
  entries: readonly NoteEntry[],
): readonly NoteEntry[] {
  return [...entries].sort((a, b) => {
    const rankDelta =
      priorityRank(notePriority(a)) - priorityRank(notePriority(b));

    return rankDelta !== 0 ? rankDelta : b.mtime - a.mtime;
  });
}

/** Options for listing notes. */
export interface ListNotesOptions {
  /** Only include notes with this tag, compared case-insensitively. */
  readonly tag?: string;
}

/** Options for searching notes. */
export interface SearchNotesOptions extends ListNotesOptions {
  /** Fuzzy search text matched against note metadata. */
  readonly query: string;
  /** Search every projects directory, not only the configured project. */
  readonly all?: boolean;
}

/** Input for replacing a note's content. */
export interface WriteNoteInput {
  /** Absolute path to a note file inside the notes vault. */
  readonly path: string;
  /** The note's complete new content. */
  readonly content: string;
  /** Fail if the note no longer has this SHA-256 hash, from {@link readNote}. */
  readonly expectedHash?: string;
}

/** Input for creating a note. */
export interface CreateNoteInput {
  /** Repository scope for the new note, such as `timmo001/notes`. */
  readonly repository: string;
  /** Note template kind. Defaults to `note`. */
  readonly kind?: NoteCreateKind;
  /** Note name. */
  readonly name: string;
  /** Note description. */
  readonly description: string;
  /** The note body. */
  readonly body: string;
}

/** Input for moving a note. */
export interface MoveNoteInput {
  /** Absolute path to a note file inside the notes vault. */
  readonly path: string;
  /** Existing or remembered repository scope, such as `timmo001/notes`. */
  readonly to: string;
}

/** Input for setting a note's priority. */
export interface SetNotePriorityInput {
  /** Absolute path to a note file inside the notes vault. */
  readonly path: string;
  /** New priority. */
  readonly priority: NotePriority;
}

/** Result of setting a note's priority. */
export interface SetNotePriorityResult extends NoteGitResult {
  /** The note's path, as given. */
  readonly path: string;
  /** The priority set. */
  readonly priority: NotePriority;
}

/** The notes vault root, or its projects directory with `projects`. */
export const notesRoot = Effect.fn("notes.root")(function* (options?: {
  /** Return the projects directory instead. */
  readonly projects?: boolean;
}): Effect.fn.Return<string, NotesError, Notes> {
  const notes = yield* Notes;

  return options?.projects ? yield* notes.projectsRoot : yield* notes.root;
});

/** Project-note context for the configured project: its repository identity, notes path and notes. */
export const noteContext = Effect.fn("notes.context")(function* (
  /** Integration command requesting context, such as `codemode`. */
  command: string,
): Effect.fn.Return<NoteContextPayload, NotesError, Notes> {
  return yield* (yield* Notes).contextPayload({ command });
});

/** The configured project's notes, newest first. */
export const listNotes = Effect.fn("notes.list")(function* (
  options?: ListNotesOptions,
): Effect.fn.Return<readonly NoteEntry[], NotesError, Notes> {
  return filterNotesByTag(yield* (yield* Notes).list, options?.tag);
});

/** Notes from every projects directory, grouped by repository. */
export const listAllNotes = Effect.fn("notes.listAll")(function* (
  options?: ListNotesOptions,
): Effect.fn.Return<readonly NoteRepoSection[], NotesError, Notes> {
  return filterSectionsByTag(yield* (yield* Notes).listAll, options?.tag);
});

/** Fuzzy-search note metadata, best match first. */
export const searchNotes = Effect.fn("notes.search")(function* (
  options: SearchNotesOptions,
): Effect.fn.Return<readonly NoteEntry[], NotesError, Notes> {
  const notes = yield* Notes;

  const entries = options.all
    ? (yield* notes.listAll).flatMap((section) => section.entries)
    : yield* notes.list;

  return searchNoteEntries(
    filterNotesByTag(entries, options.tag),
    options.query,
  );
});

/** Read a note's content and SHA-256 revision hash. */
export const readNote = Effect.fn("notes.read")(function* (
  /** Absolute path to a note file inside the notes vault. */
  path: string,
): Effect.fn.Return<NoteReadResult, NotesError, Notes> {
  return yield* (yield* Notes).read(path);
});

/** The repository scopes notes can be created in or moved to. */
export const listNoteTargets = Effect.fn("notes.targets")(
  function* (): Effect.fn.Return<readonly string[], NotesError, Notes> {
    return yield* (yield* Notes).moveTargets;
  },
);

/** The configured project's handoff notes, most urgent first. */
export const listHandoffs = Effect.fn("notes.handoffs")(
  function* (): Effect.fn.Return<readonly NoteEntry[], NotesError, Notes> {
    return sortHandoffs((yield* (yield* Notes).list).filter(isHandoff));
  },
);

/** Handoff notes from every projects directory, grouped by repository. */
export const listAllHandoffs = Effect.fn("notes.handoffsAll")(
  function* (): Effect.fn.Return<
    readonly NoteRepoSection[],
    NotesError,
    Notes
  > {
    return filterSectionsByTag(yield* (yield* Notes).listAll, "handoff");
  },
);

/** Replace a note's content, then commit and push it. */
export const writeNote = Effect.fn("notes.write")(function* (
  input: WriteNoteInput,
): Effect.fn.Return<NoteWriteResult, NotesError, Notes> {
  return yield* (yield* Notes).write(input.path, input.content, {
    expectedHash: input.expectedHash,
  });
});

/** Create a note, then commit and push it. */
export const createNote = Effect.fn("notes.create")(function* (
  input: CreateNoteInput,
): Effect.fn.Return<NoteCreateResult, NotesError, Notes> {
  return yield* (yield* Notes).createFromInput(
    input.repository,
    input.kind ?? "note",
    input.name,
    input.description,
    input.body,
  );
});

/** Delete a note, then commit and push it. */
export const deleteNote = Effect.fn("notes.delete")(function* (
  /** Absolute path to a note file inside the notes vault. */
  path: string,
): Effect.fn.Return<NoteDeleteResult, NotesError, Notes> {
  return yield* (yield* Notes).delete(path);
});

/** Move a note to another known repository scope, then commit and push it. */
export const moveNote = Effect.fn("notes.move")(function* (
  input: MoveNoteInput,
): Effect.fn.Return<NoteMoveResult, NotesError, Notes> {
  return yield* (yield* Notes).move(input.path, input.to);
});

/** Set a note's priority, then commit and push it. */
export const setNotePriority = Effect.fn("notes.priority")(function* (
  input: SetNotePriorityInput,
): Effect.fn.Return<SetNotePriorityResult, NotesError, Notes> {
  const result = yield* (yield* Notes).setPriority(input.path, input.priority);

  return { path: input.path, priority: input.priority, ...result };
});
