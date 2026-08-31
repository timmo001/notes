import Fuse, { type IFuseOptions } from "fuse.js";
import type { NoteEntry } from "./types.js";

const NOTE_SEARCH_OPTIONS: IFuseOptions<NoteEntry> = {
  keys: [
    { name: "name", weight: 4 },
    { name: "tags", weight: 2 },
    { name: "description", weight: 1 },
    { name: "filename", weight: 1 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
};

/** Search note metadata using the same ranking as the interactive view. */
export function searchNoteEntries(
  entries: readonly NoteEntry[],
  query: string,
): readonly NoteEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return entries;
  return new Fuse([...entries], NOTE_SEARCH_OPTIONS)
    .search(trimmed)
    .map((result) => result.item);
}
