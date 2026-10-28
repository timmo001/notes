# @timmo001/effect-notes

Effect services for [notes](https://github.com/timmo001/notes), repository-scoped Markdown notes kept in a git vault. The `notes` CLI, TUI and MCP server are built on it, and other programs can use it to run note operations in-process. Early development: the API will change before 1.0.

## Install

```bash
bun add @timmo001/effect-notes effect @effect/platform-node
npm install @timmo001/effect-notes effect @effect/platform-node
npx jsr add @timmo001/effect-notes
```

`effect` and `@effect/platform-node` are peer dependencies, so install the Effect v4 versions your app uses.

## Usage

`NotesLayer.make` builds the `Notes` service for a project directory. The vault and state directories default to `$NOTES` (or `$DOT_NOTES_DIR`, then `~/Documents/notes`) and `$XDG_STATE_HOME/notes`; pass `notesDir` or `stateDir` to override them.

```ts
import { Effect } from "effect";
import { listNotes, NotesLayer, readNote } from "@timmo001/effect-notes";

const notes = await Effect.runPromise(
  listNotes({ tag: "handoff" }).pipe(
    Effect.provide(NotesLayer.make({ projectDir: "/path/to/repo" })),
  ),
);
```

Writes (`writeNote`, `createNote`, `deleteNote`, `moveNote`, `setNotePriority`) commit to the vault and push it.

## Licence

Apache 2.0. See [LICENSE](https://github.com/timmo001/notes/blob/main/LICENSE).
