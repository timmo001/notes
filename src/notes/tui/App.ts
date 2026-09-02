import type { CliRenderer } from "@opentui/core";
import type { Theme } from "../../theme.js";
import type { AgentOpenMode, AgentTarget } from "../agentTargets.js";
import type {
  NoteCreateKind,
  NoteCreateResult,
  NoteDeleteResult,
  NoteEntry,
  NoteGitResult,
  NoteMoveResult,
  NotePriority,
  NoteRepoSection,
  NotesTuiScope,
  NotesViewFilter,
} from "../types.js";
import { NotesView } from "./NotesView.js";
import type { NoteEditorKind } from "./NoteEditor.js";

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
  /** Resolve the initial repository scope and its note entries. */
  readonly loadTuiScope: () => Promise<NotesTuiScope>;
  /** List note entries grouped by every repository notes directory. */
  readonly listAllNotes: () => Promise<readonly NoteRepoSection[]>;
  /** Read the full markdown content for a note file. */
  readonly readNote: (filePath: string) => Promise<string>;
  /** Delete a note file from the notes vault. */
  readonly deleteNote: (filePath: string) => Promise<NoteDeleteResult>;
  /** List known repository scopes that can receive moved notes. */
  readonly listMoveTargets: () => Promise<readonly string[]>;
  /** Move a note to another known repository scope. */
  readonly moveNote: (
    filePath: string,
    repoSlug: string,
  ) => Promise<NoteMoveResult>;
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
  /** List installed agent targets in picker order. */
  readonly listAgentTargets: () => Promise<readonly AgentTarget[]>;
  /** Open a note in an installed agent through Herdr. */
  readonly openAgent: (
    entry: NoteEntry,
    noteContent: string,
    target: AgentTarget,
    mode: AgentOpenMode,
  ) => Promise<void>;
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
      loadTuiScope: deps.loadTuiScope,
      listAllNotes: deps.listAllNotes,
      readNote: deps.readNote,
      deleteNote: deps.deleteNote,
      listMoveTargets: deps.listMoveTargets,
      moveNote: deps.moveNote,
      createNote: deps.createNote,
      editNote: deps.editNote,
      listAgentTargets: deps.listAgentTargets,
      onOpenAgent: deps.openAgent,
      onSetPriority: deps.updateNotePriority,
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
