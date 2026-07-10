import type { CliRenderer } from "@opentui/core";
import type { Theme } from "../../theme.js";
import type {
  NoteCreateKind,
  NoteCreateResult,
  NoteDeleteResult,
  NoteEntry,
  NoteGitResult,
  NotePriority,
  NoteRepoSection,
  NotesViewFilter,
} from "../types.js";
import { NotesView } from "./NotesView.js";
import type { NoteEditorKind } from "./NoteEditor.js";
import { openNoteInOpenCode, type OpenCodeNoteMode } from "./OpenCodeNote.js";

const setTerminalTitle = (title: string): void => {
  process.stdout.write(`\x1b]0;${title}\x07`);
};

/** Startup options controlling the notes TUI. */
export interface AppOptions {
  /** Optional initial filter to apply. */
  readonly initialNotesFilter?: NotesViewFilter;
}

/** Dependencies injected into the notes TUI app. */
export interface AppDeps {
  /** The OpenTUI CLI renderer instance. */
  readonly renderer: CliRenderer;
  /** Active colour theme. */
  readonly theme: Theme;
  /** List note entries for the current repository. */
  readonly listNotes: () => Promise<readonly NoteEntry[]>;
  /** List note entries grouped by every repository notes directory. */
  readonly listAllNotes: () => Promise<readonly NoteRepoSection[]>;
  /** Read the full markdown content for a note file. */
  readonly readNote: (filePath: string) => Promise<string>;
  /** Delete a note file from the notes vault. */
  readonly deleteNote: (filePath: string) => Promise<NoteDeleteResult>;
  /** Create, edit, and commit a note as one transaction. */
  readonly createNote: (
    kind: NoteCreateKind,
    name: string,
    description: string,
    editorKind: NoteEditorKind,
  ) => Promise<NoteCreateResult>;
  /** Run an editor and commit the resulting note change as one transaction. */
  readonly editNote: (
    entry: NoteEntry,
    kind: NoteEditorKind,
    create: boolean,
  ) => Promise<NoteGitResult>;
  /** Set the priority for a note and commit it. */
  readonly updateNotePriority: (
    filePath: string,
    priority: NotePriority,
  ) => Promise<NoteGitResult>;
}

/** Top-level TUI app for the standalone notes command. */
export class App {
  private readonly notesView: NotesView;
  private activeNotesFilter: NotesViewFilter | null = null;

  constructor(deps: AppDeps, options: AppOptions = {}) {
    this.notesView = new NotesView(deps.renderer, deps.theme, {
      listNotes: deps.listNotes,
      listAllNotes: deps.listAllNotes,
      readNote: deps.readNote,
      deleteNote: deps.deleteNote,
      createNote: deps.createNote,
      editNote: deps.editNote,
      onSetPriority: deps.updateNotePriority,
      onOpenOpencode: (entry, noteContent, mode: OpenCodeNoteMode) =>
        openNoteInOpenCode(deps.renderer, entry, noteContent, {
          mode,
          afterResume: () => {
            setTerminalTitle(`Notes TUI > ${this.notesTitle()}`);
          },
        }),
      onBack: () => deps.renderer.destroy(),
    });
    this.setNotesFilter(options.initialNotesFilter ?? null);
    setTerminalTitle(`Notes TUI > ${this.notesTitle()}`);
    this.notesView.setVisible(true);
    this.notesView.focus();
  }

  private setNotesFilter(filter: NotesViewFilter | null): void {
    this.activeNotesFilter = filter;
    this.notesView.setFilter(filter);
  }

  private notesTitle(): string {
    const title = this.activeNotesFilter?.title ?? "Notes";
    if (!this.activeNotesFilter?.includeAllRepos) return title;
    return title.startsWith("All ") ? title : `All ${title}`;
  }
}
