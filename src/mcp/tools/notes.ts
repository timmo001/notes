import { Effect, Schema } from "effect";
import { Notes } from "../../notes/services/Notes.js";
import type {
  NoteDeleteResult,
  NoteEntry,
  NoteRepoSection,
  NoteWriteResult,
} from "../../notes/types.js";
import { noteGitOutcome } from "../../notes/gitOutcome.js";
import { Notifier, type NotifierService } from "../services/Notifier.js";
import {
  DESTRUCTIVE_HINTS,
  makeToolRegistrar,
  READONLY_HINTS,
} from "./register.js";

const NoteReadParams = Schema.Struct({
  path: Schema.String.annotate({
    description:
      "Absolute path to the note file (e.g. /home/user/Documents/notes/projects/owner/repo/slug.md)",
  }),
});

const ExpectedHash = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[0-9a-f]{64}$/, {
      expected: "a lowercase SHA-256 hash",
    }),
  ),
);

const NoteListParams = Schema.Struct({
  tag: Schema.optional(
    Schema.String.annotate({
      description:
        "Optional tag to filter notes by (e.g. 'handoff'). Only notes with this tag are returned.",
    }),
  ),
  all: Schema.optional(
    Schema.Boolean.annotate({
      description:
        "List notes from all projects instead of just the current one.",
    }),
  ),
});

const NoteWriteParams = Schema.Struct({
  path: Schema.String.annotate({
    description:
      "Absolute path to the note file (e.g. /home/user/Documents/notes/projects/owner/repo/slug.md)",
  }),
  content: Schema.String.annotate({
    description:
      "Full file content to write, including frontmatter and all sections",
  }),
  expectedHash: Schema.optional(
    ExpectedHash.annotate({
      description:
        "Optional SHA-256 hash returned by note_read. The write fails if the existing note changed.",
    }),
  ),
});

const NoteDeleteParams = Schema.Struct({
  path: Schema.String.annotate({
    description:
      "Absolute path to the note file to delete (e.g. /home/user/Documents/notes/projects/owner/repo/slug.md)",
  }),
});

function hasTag(entry: NoteEntry, tag: string): boolean {
  const wanted = tag.toLowerCase();
  return entry.tags.some((current) => current.toLowerCase() === wanted);
}

function filterEntriesByTag(
  entries: readonly NoteEntry[],
  tag: string,
): readonly NoteEntry[] {
  return entries.filter((entry) => hasTag(entry, tag));
}

function filterSectionsByTag(
  sections: readonly NoteRepoSection[],
  tag: string,
): readonly NoteRepoSection[] {
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((entry) => hasTag(entry, tag)),
    }))
    .filter((section) => section.entries.length > 0);
}

function formatMutationOutput(
  result: NoteWriteResult | NoteDeleteResult,
): string {
  const outcome = noteGitOutcome(result);
  const commit = result.commit.sha
    ? `\n\nCommit: \`${result.commit.sha}\``
    : "";
  const output = outcome.complete
    ? result.push
      ? `${result.output}\n\nPushed: ${result.push.message}`
      : result.output
    : `${result.output}\n\nPartial success: ${outcome.detail}`;
  return `${output}${commit}`;
}

function notifyMutation(
  notifier: NotifierService,
  action: string,
  result: NoteWriteResult | NoteDeleteResult,
): Effect.Effect<void> {
  const name = result.path.split("/").pop() || result.path;
  const detail = noteGitOutcome(result).detail;
  return notifier.notify(`notes: ${action}`, `${name} - ${detail}`);
}

/** Register the note tools on the current MCP server. */
export const registerNotesTools = Effect.gen(function* () {
  const register = yield* makeToolRegistrar;
  const notes = yield* Notes;
  const notifier = yield* Notifier;

  yield* register({
    name: "note_read",
    description:
      "Read the full content and SHA-256 revision of a note file from the notes vault. " +
      "Use this to read an existing note before appending to it. " +
      "This is the ONLY permitted way to read note files when a vault guard is active.",
    parameters: NoteReadParams,
    annotations: READONLY_HINTS,
    handle: (params) =>
      notes
        .read(params.path)
        .pipe(Effect.map((result) => JSON.stringify(result))),
  });

  yield* register({
    name: "note_list",
    description:
      "List note files in the notes vault for the current project. " +
      "Returns JSON with filename, name, description, tags, priority, and modification time for each note. " +
      "Optionally filter by tag (e.g. 'handoff') or list notes from all projects.",
    parameters: NoteListParams,
    annotations: READONLY_HINTS,
    handle: (params) =>
      Effect.gen(function* () {
        if (params.all) {
          const sections = yield* notes.listAll();
          const filtered = params.tag
            ? filterSectionsByTag(sections, params.tag)
            : sections;
          return JSON.stringify(filtered, null, 2);
        }
        const entries = yield* notes.list();
        const filtered = params.tag
          ? filterEntriesByTag(entries, params.tag)
          : entries;
        return JSON.stringify(filtered, null, 2);
      }),
  });

  yield* register({
    name: "note_write",
    description:
      "Write a note file to the notes vault, then commit and best-effort push it. " +
      "Sets or refreshes the frontmatter `date:` to the current local timestamp automatically. " +
      "Creates parent directories automatically. " +
      "This is the ONLY permitted way to write note files when a vault guard is active.",
    parameters: NoteWriteParams,
    annotations: DESTRUCTIVE_HINTS,
    handle: (params) =>
      Effect.gen(function* () {
        const result = yield* notes.write(params.path, params.content, {
          expectedHash: params.expectedHash,
        });
        yield* notifyMutation(notifier, "written", result);
        return formatMutationOutput(result);
      }),
  });

  yield* register({
    name: "note_delete",
    description:
      "Delete a note file from the notes vault, then commit and best-effort push it. " +
      "IMPORTANT: deletion is irreversible; confirm with the user before calling this tool. " +
      "This is the ONLY permitted way to delete note files when a vault guard is active.",
    parameters: NoteDeleteParams,
    annotations: DESTRUCTIVE_HINTS,
    handle: (params) =>
      Effect.gen(function* () {
        const result = yield* notes.delete(params.path);
        yield* notifyMutation(notifier, "deleted", result);
        return formatMutationOutput(result);
      }),
  });
});
