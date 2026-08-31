import {
  type CliRenderer,
  BoxRenderable,
  CliRenderEvents,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextRenderable,
  type KeyEvent,
  t,
  bold,
  fg,
} from "@opentui/core";
import type { Theme } from "../../theme.js";
import { AppHeader } from "../../tui/AppHeader.js";
import { CommandBar, type CommandHint } from "../../tui/CommandBar.js";
import { PaneHeader } from "../../tui/PaneHeader.js";
import { Collapsible } from "../../tui/components/Collapsible.js";
import { Dialog } from "../../tui/components/Dialog.js";
import { ScrollSurface } from "../../tui/components/ScrollSurface.js";
import { surfaceBackground } from "../../tui/components/styles.js";
import { editorLabel } from "../../tui/externalEditor.js";
import { openCodeSessionLabel } from "../../tui/openCodeSession.js";
import { StatusList, type StatusListItem } from "../../tui/StatusList.js";
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
import {
  GROUP_CYCLE,
  notePriority,
  priorityLabel,
  priorityRank,
  type NoteGroupMode,
} from "../types.js";
import { formatLocalNoteDateTimeFromEpochSeconds } from "../time.js";
import { noteGitOutcome } from "../gitOutcome.js";
import { searchNoteEntries } from "../search.js";
import type { NoteEditorKind } from "./NoteEditor.js";
import {
  CreateNoteDialog,
  type CreateNoteDialogResult,
} from "./dialogs/CreateNoteDialog.js";
import { DeleteNoteDialog } from "./dialogs/DeleteNoteDialog.js";
import { HelpDialog } from "./dialogs/HelpDialog.js";
import { MoveNoteDialog } from "./dialogs/MoveNoteDialog.js";
import { PriorityDialog, priorityColor } from "./dialogs/PriorityDialog.js";
import type { OpenCodeNoteMode } from "./OpenCodeNote.js";
import { measureNotesLayout, type NotesLayout } from "./layout.js";

const COMMANDS: readonly CommandHint[] = [
  { key: "Tab", action: "pane", contexts: ["list", "content"], priority: 1 },
  {
    key: "Esc",
    action: "back",
    contexts: ["list", "content", "search", "minimum"],
    priority: 1,
  },
  { key: "↕", action: "navigate", contexts: ["list"], priority: 2 },
  { key: "Enter", action: "preview", contexts: ["list"], priority: 3 },
  { key: "/", action: "search", contexts: ["list"], priority: 4 },
  { key: "a", action: "create", contexts: ["list", "content"], priority: 5 },
  { key: "e", action: "edit", contexts: ["list", "content"], priority: 6 },
  { key: "i", action: "details", contexts: ["content"], priority: 2 },
  { key: "?", action: "help", contexts: ["list", "content"], priority: 7 },
];

type NotesPane = "list" | "content";
type NoteSortMode = "modified-desc" | "modified-asc" | "name-asc" | "name-desc";

const SORT_CYCLE: readonly NoteSortMode[] = [
  "modified-desc",
  "modified-asc",
  "name-asc",
  "name-desc",
];
/** Configuration callbacks for the repository notes view. */
export interface NotesViewOptions {
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
  /** Move a note to another repository scope. */
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
  /** Open the selected note in a full OpenCode session. */
  readonly onOpenOpencode: (
    entry: NoteEntry,
    noteContent: string,
    mode: OpenCodeNoteMode,
  ) => Promise<void>;
  /** Set the priority for a note and commit it. */
  readonly onSetPriority: (
    filePath: string,
    priority: NotePriority,
  ) => Promise<NoteGitResult>;
  /** Called when the user navigates back or exits. */
  readonly onBack: () => void;
}

/** Two-pane repository notes browser with metadata and scrollable markdown. */
export class NotesView {
  private readonly renderer: CliRenderer;
  private readonly callbacks: NotesViewOptions;
  private readonly theme: Theme;
  private readonly syntaxStyle: SyntaxStyle;
  private readonly root: BoxRenderable;
  private readonly shell: BoxRenderable;
  private readonly workspace: BoxRenderable;
  private readonly leftPane: BoxRenderable;
  private readonly rightPane: BoxRenderable;
  private readonly divider: TextRenderable;
  private readonly minimumSize: BoxRenderable;
  private readonly minimumSizeText: TextRenderable;
  private readonly appHeader: AppHeader;
  private readonly noteList: StatusList<NoteEntry>;
  private readonly listTitle: PaneHeader;
  private readonly contentTitle: PaneHeader;
  private readonly noteHeading: TextRenderable;
  private readonly noteSummary: TextRenderable;
  private readonly noteDescription: TextRenderable;
  private readonly noteTags: TextRenderable;
  private readonly notePriorityText: TextRenderable;
  private readonly noteFile: TextRenderable;
  private readonly noteModified: TextRenderable;
  private readonly metadata: Collapsible;
  private readonly bodySurface: ScrollSurface;
  private readonly bodyScroll: ScrollBoxRenderable;
  private readonly markdown: MarkdownRenderable;
  private readonly commandBar: CommandBar;
  private readonly statusBar: TextRenderable;
  private readonly createPrompt: CreateNoteDialog;
  private readonly priorityPopup: PriorityDialog;
  private readonly movePopup: MoveNoteDialog;
  private readonly deletePrompt: DeleteNoteDialog;
  private readonly helpDialog: HelpDialog;
  private layout: NotesLayout;
  private metadataPreference: boolean | null = null;
  private filter: NotesViewFilter | null = null;
  private activePane: NotesPane = "list";
  private sortMode: NoteSortMode = "name-asc";
  private groupMode: NoteGroupMode = "repo";
  private searchActive = false;
  private searchQuery = "";
  private entries: readonly NoteEntry[] = [];
  private visibleEntries: readonly NoteEntry[] = [];
  private showingAllRepos = false;
  private usingAllReposFallback = false;
  private preferredInitialRepoSlug: string | null = null;
  private selectedFilePath: string | null = null;
  private selectedEntry: NoteEntry | null = null;
  private loadedNoteContent: string | null = null;
  private loadedNoteContentPath: string | null = null;
  private isVisible = false;
  private activeOperation: string | null = null;
  private acknowledgement: string | null = null;
  private openingOpenCode = false;
  private editingFilePath: string | null = null;
  private creatingNote = false;
  private createEditorKind: NoteEditorKind = "editor";
  private deleteConfirmation: NoteEntry | null = null;
  private deletingFilePath: string | null = null;
  private settingPriorityPath: string | null = null;
  private requestedInitialRefresh = false;
  private loadVersion = 0;
  private readonly keyHandlers: Readonly<Record<string, () => void>>;
  private readonly keyHandler: (key: KeyEvent) => void;
  private readonly resizeHandler: () => void;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    callbacks: NotesViewOptions,
  ) {
    this.renderer = renderer;
    this.callbacks = callbacks;
    this.theme = theme;
    this.syntaxStyle = createMarkdownSyntaxStyle(theme);
    this.keyHandlers = {
      tab: () => this.togglePane(),
      a: () => this.startCreateFlow("editor"),
      "shift+a": () => this.startCreateFlow("visual"),
      v: () => this.toggleAllRepos(),
      e: () => void this.openSelectedInEditor("editor"),
      "shift+e": () => void this.openSelectedInEditor("visual"),
      o: () => void this.openSelectedInOpenCode("default"),
      "shift+o": () => void this.openSelectedInOpenCode("plan"),
      r: () => void this.refresh(),
      "/": () => this.enterSearch(),
      s: () => this.cycleSortMode(),
      g: () => this.cycleGroupMode(),
      p: () => this.requestChangePriority(),
      m: () => void this.requestMoveSelected(),
      d: () => this.requestDeleteSelected(),
      i: () => this.toggleMetadata(),
      "?": () => this.helpDialog.show(),
      escape: () => this.callbacks.onBack(),
      backspace: () => this.callbacks.onBack(),
    };
    this.root = new BoxRenderable(renderer, {
      id: "notes-root",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: 1,
    });
    this.shell = new BoxRenderable(renderer, {
      id: "notes-shell",
      flexDirection: "column",
      width: "100%",
      height: "100%",
    });
    this.appHeader = new AppHeader(renderer, {
      id: "notes-app-header",
      theme,
      title: "Notes",
      scope: "repo notes",
    });
    this.workspace = new BoxRenderable(renderer, {
      id: "notes-pane-container",
      flexDirection: "row",
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
    });
    this.leftPane = new BoxRenderable(renderer, {
      id: "notes-left-pane",
      flexDirection: "column",
      flexShrink: 1,
      minHeight: 0,
    });
    this.listTitle = new PaneHeader(renderer, "notes-list-title", theme);
    this.leftPane.add(this.listTitle);
    this.noteList = new StatusList(renderer, {
      id: "notes-list",
      theme,
      onSelect: () => this.focusPane("content"),
      onSelectionChanged: (item) => {
        this.selectedFilePath = item.value.filePath;
        void this.loadNote(item.value);
      },
    });
    this.noteList.flexShrink = 1;
    this.noteList.minHeight = 0;
    this.leftPane.add(this.noteList);
    this.divider = new TextRenderable(renderer, {
      id: "notes-divider",
      content: t`${fg(theme.fgSubtle)("│")}`,
      width: 1,
      height: "100%",
      flexShrink: 0,
    });
    this.rightPane = new BoxRenderable(renderer, {
      id: "notes-right-pane",
      flexDirection: "column",
      flexShrink: 1,
      minHeight: 0,
    });
    this.contentTitle = new PaneHeader(renderer, "notes-content-title", theme);
    this.rightPane.add(this.contentTitle);
    const heading = new BoxRenderable(renderer, {
      id: "notes-content-heading",
      flexDirection: "column",
      width: "100%",
      flexShrink: 0,
      backgroundColor: surfaceBackground(theme),
    });
    this.noteHeading = new TextRenderable(renderer, {
      id: "notes-content-heading-title",
      content: t`${bold(fg(theme.fgMuted)("No note selected"))}`,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.noteSummary = new TextRenderable(renderer, {
      id: "notes-content-summary",
      content: "",
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    heading.add(this.noteHeading);
    heading.add(this.noteSummary);
    this.metadata = new Collapsible(renderer, {
      id: "notes-details",
      theme,
      label: "Details",
      open: true,
      onOpenChange: (open) => (this.metadataPreference = open),
    });
    this.noteDescription = new TextRenderable(renderer, {
      id: "notes-content-heading-desc",
      content: t``,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.noteTags = new TextRenderable(renderer, {
      id: "notes-content-heading-tags",
      content: t``,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.notePriorityText = new TextRenderable(renderer, {
      id: "notes-content-heading-priority",
      content: t``,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.noteFile = new TextRenderable(renderer, {
      id: "notes-content-heading-file",
      content: t``,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.noteModified = new TextRenderable(renderer, {
      id: "notes-content-heading-modified",
      content: t``,
      width: "100%",
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
    });
    this.metadata.panel.add(this.noteDescription);
    this.metadata.panel.add(this.noteTags);
    this.metadata.panel.add(this.notePriorityText);
    this.metadata.panel.add(this.noteFile);
    this.metadata.panel.add(this.noteModified);
    heading.add(this.metadata);
    this.rightPane.add(heading);
    this.bodySurface = new ScrollSurface(renderer, {
      id: "notes-content-scroll",
      theme,
      flexGrow: 1,
      flexShrink: 1,
      minHeight: 0,
      width: "100%",
      scrollY: true,
      scrollX: false,
      backgroundColor: surfaceBackground(theme),
      focusable: true,
      wrapperOptions: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
      viewportOptions: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
      contentOptions: { flexDirection: "column", width: "100%" },
    });
    this.bodyScroll = this.bodySurface.scrollBox;
    this.markdown = new MarkdownRenderable(renderer, {
      id: "notes-content-markdown",
      content: "Select a note to preview its content.",
      syntaxStyle: this.syntaxStyle,
      width: "100%",
      fg: theme.fg,
      bg: surfaceBackground(theme),
      conceal: true,
      tableOptions: { widthMode: "full", wrapMode: "word" },
    });
    this.bodySurface.addContent(this.markdown);
    this.rightPane.add(this.bodySurface);
    this.workspace.add(this.leftPane);
    this.workspace.add(this.divider);
    this.workspace.add(this.rightPane);
    this.commandBar = new CommandBar(renderer, "notes-command-bar", theme);
    this.statusBar = this.commandBar.status;
    this.shell.add(this.appHeader);
    this.shell.add(this.workspace);
    this.shell.add(this.commandBar);
    this.minimumSize = new BoxRenderable(renderer, {
      id: "notes-minimum-size",
      visible: false,
      focusable: true,
      width: "100%",
      height: "100%",
    });
    this.minimumSizeText = new TextRenderable(renderer, {
      id: "notes-minimum-size-text",
      width: "100%",
      height: "100%",
      content: "",
      wrapMode: "word",
    });
    this.minimumSize.add(this.minimumSizeText);
    this.root.add(this.shell);
    this.root.add(this.minimumSize);
    this.createPrompt = new CreateNoteDialog(
      renderer,
      theme,
      (result) => void this.executeCreateFlow(result),
      () => this.cancelCreateFlow(),
    );
    this.priorityPopup = new PriorityDialog(renderer, theme, {
      onApply: (priority) => void this.executeSetPriority(priority),
      onDismiss: () => this.cancelChangePriority(),
    });
    this.movePopup = new MoveNoteDialog(
      renderer,
      theme,
      (repo) => void this.executeMove(repo),
      () => this.cancelMove(),
    );
    this.deletePrompt = new DeleteNoteDialog(
      renderer,
      theme,
      () => void this.confirmDeleteSelected(),
      () => this.cancelDeleteConfirmation(),
    );
    this.helpDialog = new HelpDialog(renderer, theme, () =>
      this.focusPane(this.activePane),
    );
    this.layout = measureNotesLayout(renderer.width, renderer.height);
    this.keyHandler = (key) => this.handleKeyPress(key);
    this.resizeHandler = () => {
      this.applyLayout(measureNotesLayout(renderer.width, renderer.height));
      renderer.requestRender();
      queueMicrotask(() => {
        this.noteList.realign();
        this.bodySurface.syncMarker();
      });
    };
    renderer.keyInput.on("keypress", this.keyHandler);
    renderer.on(CliRenderEvents.RESIZE, this.resizeHandler);
    renderer.root.add(this.root);
    this.applyLayout(this.layout);
    this.focus();
  }

  /** Update the note filter used by this view. */
  setFilter(filter: NotesViewFilter | null): void {
    const previous = this.filterKey;
    this.filter = filter;
    if (previous !== this.filterKey) {
      this.clearDeleteConfirmation(false);
      this.searchActive = false;
      this.searchQuery = "";
      this.selectedFilePath = null;
      this.selectedEntry = null;
      this.loadedNoteContent = null;
      this.loadedNoteContentPath = null;
      this.showingAllRepos = filter?.includeAllRepos === true;
      this.usingAllReposFallback = false;
      this.updateAppHeader();
      this.applyFilter();
      if (this.isVisible) void this.refresh();
    }
  }

  /** Show or hide the notes view. */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.root.visible = visible;
    if (!visible) {
      this.clearDeleteConfirmation(false);
      return;
    }
    if (this.layout.mode === "minimum")
      this.renderer.focusRenderable(this.minimumSize);
    if (this.requestedInitialRefresh) return;
    this.requestedInitialRefresh = true;
    void this.refresh();
  }

  /** Give keyboard focus to the currently active pane. */
  focus(): void {
    if (this.layout.mode === "minimum") return;
    this.focusPane(this.activePane);
  }

  /** Remove the notes view from the render tree. */
  destroy(): void {
    this.syntaxStyle.destroy();
    this.createPrompt.destroy();
    this.priorityPopup.destroy();
    this.movePopup.destroy();
    this.deletePrompt.destroy();
    this.helpDialog.destroy();
    this.renderer.keyInput.off("keypress", this.keyHandler);
    this.renderer.off(CliRenderEvents.RESIZE, this.resizeHandler);
    this.renderer.root.remove(this.root);
  }

  private get filterKey(): string {
    const tag = this.filter?.tag?.toLowerCase() ?? "";
    const scope = this.filter?.includeAllRepos ? "all" : "current";
    return `${tag}:${scope}`;
  }

  private async refresh(): Promise<boolean> {
    const version = ++this.loadVersion;
    this.statusBar.content = t`${fg(this.theme.yellow)("Refreshing notes...")}`;
    try {
      const loaded = await this.loadEntriesForActiveScope();
      if (version !== this.loadVersion) return false;
      this.entries = loaded.entries;
      this.showingAllRepos = loaded.allRepos;
      this.usingAllReposFallback = loaded.fallback;
      this.preferredInitialRepoSlug = loaded.preferredRepoSlug ?? null;
      this.updateAppHeader();
      this.applyFilter();
      this.updateStatusBar();
      return true;
    } catch (error) {
      if (version !== this.loadVersion) return false;
      this.entries = [];
      this.visibleEntries = [];
      this.noteList.setItems([]);
      this.showEmptyContent("Unable to load notes", errorMessage(error));
      this.statusBar.content = t`${fg(this.theme.red)(`Unable to load notes: ${errorMessage(error)}`)}`;
      return false;
    }
  }

  private async loadEntriesForActiveScope(): Promise<{
    readonly entries: readonly NoteEntry[];
    readonly allRepos: boolean;
    readonly fallback: boolean;
    readonly preferredRepoSlug?: string;
  }> {
    if (this.filter?.includeAllRepos) {
      return {
        entries: flattenNoteSections(await this.callbacks.listAllNotes()),
        allRepos: true,
        fallback: false,
      };
    }

    const scope = await this.callbacks.loadTuiScope();
    if (scope.scope === "all") {
      return {
        entries: flattenNoteSections(scope.sections),
        allRepos: true,
        fallback: true,
        preferredRepoSlug: scope.repoSlug,
      };
    }
    return { entries: scope.entries, allRepos: false, fallback: false };
  }

  private applyFilter(): void {
    const tagFiltered = this.entries.filter((entry) =>
      matchesFilter(entry, this.filter),
    );
    const query = this.searchQuery.trim();
    const searching = query.length > 0;
    this.visibleEntries = searching
      ? this.searchEntries(tagFiltered, query)
      : this.sortEntries(tagFiltered);
    const preferredFilePath =
      this.selectedFilePath ??
      (this.preferredInitialRepoSlug
        ? this.visibleEntries.find(
            (entry) => entry.repoSlug === this.preferredInitialRepoSlug,
          )?.filePath
        : undefined);
    this.preferredInitialRepoSlug = null;
    this.noteList.setItems(
      this.visibleEntries.map((entry) => this.listItem(entry, !searching)),
      preferredFilePath,
    );
    this.updateAppHeader();
    this.updatePaneTitles();
    if (this.visibleEntries.length === 0)
      this.showEmptyContent(this.emptyTitle(), this.emptyBody());
  }

  private searchEntries(
    candidates: readonly NoteEntry[],
    query: string,
  ): readonly NoteEntry[] {
    return searchNoteEntries(candidates, query);
  }

  private enterSearch(): void {
    if (this.searchActive) return;
    this.searchActive = true;
    this.activePane = "list";
    this.noteList.setActive(true, { focus: false });
    this.bodyScroll.blur();
    this.updatePaneTitles();
    this.updateStatusBar();
  }

  private exitSearch(): void {
    this.searchActive = false;
    this.applyFilter();
    this.focusPane("list");
    this.updateStatusBar();
  }

  private handleSearchKey(key: KeyEvent): void {
    if (key.name === "escape" || key.name === "return") {
      this.exitSearch();
      return;
    }
    if (key.name === "up") {
      this.noteList.selectPrevious();
      return;
    }
    if (key.name === "down") {
      this.noteList.selectNext();
      return;
    }
    if (key.name === "backspace") {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.applySearchQuery();
      } else {
        this.exitSearch();
      }
      return;
    }
    if (
      key.sequence &&
      key.sequence.length === 1 &&
      !key.ctrl &&
      !key.meta &&
      key.sequence >= " "
    ) {
      this.searchQuery += key.sequence;
      this.applySearchQuery();
    }
  }

  private applySearchQuery(): void {
    this.applyFilter();
    this.updateStatusBar();
  }

  private cycleSortMode(): void {
    const nextIndex =
      (SORT_CYCLE.indexOf(this.sortMode) + 1) % SORT_CYCLE.length;
    this.sortMode = SORT_CYCLE[nextIndex];
    this.applyFilter();
    this.updateStatusBar();
  }

  private cycleGroupMode(): void {
    const nextIndex =
      (GROUP_CYCLE.indexOf(this.groupMode) + 1) % GROUP_CYCLE.length;
    this.groupMode = GROUP_CYCLE[nextIndex];
    this.applyFilter();
    this.updateStatusBar();
  }

  private isHandoffFilter(): boolean {
    return this.filter?.tag?.toLowerCase() === "handoff";
  }

  private groupingByPriority(): boolean {
    return this.groupMode === "priority";
  }

  private groupingByRepo(): boolean {
    return this.groupMode === "repo";
  }

  private sortEntries(entries: readonly NoteEntry[]): readonly NoteEntry[] {
    const compare = sortComparator(this.sortMode);
    if (this.groupingByPriority()) {
      return [...entries].sort((a, b) => {
        const rankDelta =
          priorityRank(notePriority(a)) - priorityRank(notePriority(b));
        return rankDelta !== 0 ? rankDelta : compare(a, b);
      });
    }

    if (!this.groupingByRepo()) return [...entries].sort(compare);
    const sectionOrder = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.repoSlug ?? "";
      if (!sectionOrder.has(key)) sectionOrder.set(key, sectionOrder.size);
    }
    return [...entries].sort((a, b) => {
      const sectionDelta =
        (sectionOrder.get(a.repoSlug ?? "") ?? 0) -
        (sectionOrder.get(b.repoSlug ?? "") ?? 0);
      return sectionDelta !== 0 ? sectionDelta : compare(a, b);
    });
  }

  private toggleAllRepos(): void {
    const currentFilter = this.filter;
    if (currentFilter?.includeAllRepos) {
      const nextFilter: NotesViewFilter = {
        ...(currentFilter.tag && { tag: currentFilter.tag }),
        ...(currentFilter.title && { title: currentFilter.title }),
      };
      this.setFilter(Object.keys(nextFilter).length > 0 ? nextFilter : null);
      return;
    }
    this.setFilter({ ...currentFilter, includeAllRepos: true });
  }

  private async loadNote(entry: NoteEntry): Promise<void> {
    const version = ++this.loadVersion;
    const label = notePathLabel(entry);
    this.selectedEntry = entry;
    this.loadedNoteContent = null;
    this.loadedNoteContentPath = entry.filePath;
    this.updateHeader(entry);
    this.updatePaneTitles();
    this.setMarkdownContent("Loading note content...");
    this.bodyScroll.scrollTo(0);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Loading ${label}...`)}`;

    try {
      const content = await this.callbacks.readNote(entry.filePath);
      if (version !== this.loadVersion) return;
      this.loadedNoteContent = content;
      this.setMarkdownContent(noteBodyContent(content));
      this.bodyScroll.scrollTo(0);
      this.updateStatusBar();
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.loadedNoteContent = null;
      const message = errorMessage(error);
      this.setMarkdownContent(`Failed to read note content.\n\n${message}`);
      this.bodyScroll.scrollTo(0);
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to read ${label}: ${message}`)}`;
    }
  }

  private togglePane(): void {
    this.focusPane(this.activePane === "list" ? "content" : "list");
  }

  private applyLayout(layout: NotesLayout): void {
    this.layout = layout;
    const minimum = layout.mode === "minimum";
    this.minimumSize.visible = minimum;
    this.shell.visible = !minimum;
    if (minimum) {
      this.noteList.setActive(false);
      this.bodyScroll.blur();
      this.minimumSizeText.content = t`${bold(fg(this.theme.accent)("Notes needs more room"))}\n${fg(this.theme.fgMuted)(`Resize to at least ${layout.requiredWidth}x${layout.requiredHeight}.`)}\n${fg(this.theme.fgSubtle)("Esc exits")}`;
      this.renderer.focusRenderable(this.minimumSize);
      return;
    }
    if (layout.mode === "split") {
      this.leftPane.visible = true;
      this.rightPane.visible = true;
      this.divider.visible = true;
      this.leftPane.width = layout.navigationWidth;
      this.rightPane.width = layout.previewWidth;
    } else {
      this.divider.visible = false;
      this.leftPane.width = "100%";
      this.rightPane.width = "100%";
      this.leftPane.visible = this.activePane === "list";
      this.rightPane.visible = this.activePane === "content";
    }
    this.metadata.setOpen(this.metadataOpen());
    this.commandBar.update(
      this.currentStatusText(),
      this.searchActive ? "search" : this.activePane,
      COMMANDS,
    );
    this.focusPane(this.activePane);
  }

  private metadataOpen(): boolean {
    return this.metadataPreference ?? this.layout.mode === "split";
  }

  private toggleMetadata(): void {
    if (this.activePane !== "content" || this.layout.mode === "minimum") return;
    this.metadataPreference = !this.metadataOpen();
    this.metadata.setOpen(this.metadataPreference);
  }

  private async openSelectedInOpenCode(mode: OpenCodeNoteMode): Promise<void> {
    const entry = this.selectedEntry;
    if (!entry) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Select a note before opening OpenCode")}`;
      return;
    }
    if (!this.beginOperation(`opening ${openCodeSessionLabel(mode)}`)) return;

    this.openingOpenCode = true;
    const modeLabel = openCodeSessionLabel(mode);
    const label = notePathLabel(entry);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Opening ${label} in ${modeLabel}...`)}`;
    try {
      const content =
        this.loadedNoteContentPath === entry.filePath &&
        this.loadedNoteContent !== null
          ? this.loadedNoteContent
          : await this.callbacks.readNote(entry.filePath);
      this.loadedNoteContent = content;
      this.loadedNoteContentPath = entry.filePath;
      await this.callbacks.onOpenOpencode(entry, content, mode);
      this.updateStatusBar();
    } catch (error) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to open OpenCode: ${errorMessage(error)}`)}`;
    } finally {
      this.openingOpenCode = false;
      this.endOperation();
    }
  }

  private async openSelectedInEditor(kind: NoteEditorKind): Promise<void> {
    const entry = this.selectedEntry;
    if (!entry) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Select a note before editing")}`;
      return;
    }
    if (!this.beginOperation(`editing ${notePathLabel(entry)}`)) return;

    this.editingFilePath = entry.filePath;
    this.selectedFilePath = entry.filePath;
    const label = notePathLabel(entry);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Opening ${label} in ${editorLabel(kind)}...`)}`;

    let editError: unknown;
    let gitResult: NoteGitResult | undefined;
    let refreshed = false;
    try {
      try {
        gitResult = await this.callbacks.editNote(entry, kind, false);
      } catch (error) {
        editError = error;
      }
      refreshed = await this.refresh();
    } finally {
      this.editingFilePath = null;
      this.endOperation();
    }

    if (editError) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to edit ${label}: ${errorMessage(editError)}`)}`;
      return;
    }
    if (refreshed) {
      const outcome = gitResult ? noteGitOutcome(gitResult) : undefined;
      const message = outcome?.complete
        ? `Updated ${label}`
        : `Updated ${label}; ${outcome?.detail ?? "git status unavailable"}`;
      if (outcome && !outcome.complete) this.showAcknowledgement(message);
      else this.statusBar.content = t`${fg(this.theme.green)(message)}`;
    }
  }

  private startCreateFlow(editorKind: NoteEditorKind): void {
    if (this.activeOperation) {
      this.showActiveOperation();
      return;
    }
    this.createEditorKind = editorKind;
    this.noteList.setActive(false);
    this.bodyScroll.blur();
    this.createPrompt.show(this.isHandoffFilter());
  }

  private cancelCreateFlow(): void {
    this.statusBar.content = t`${fg(this.theme.fgMuted)("Create cancelled")}`;
    this.focusPane(this.activePane);
  }

  private async executeCreateFlow(
    result: CreateNoteDialogResult,
  ): Promise<void> {
    if (!this.beginOperation(`creating ${result.kind}`)) return;
    this.creatingNote = true;
    this.statusBar.content = t`${fg(this.theme.yellow)(`Creating ${result.kind} draft...`)}`;
    this.focusPane(this.activePane);

    let created: NoteCreateResult;
    try {
      created = await this.callbacks.createNote(
        result.kind,
        result.name,
        result.description,
        this.createEditorKind,
      );
    } catch (error) {
      this.creatingNote = false;
      this.endOperation();
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to create draft: ${errorMessage(error)}`)}`;
      return;
    }

    const { draft, git } = created;
    this.selectedFilePath = draft.entry.filePath;
    try {
      await this.refresh();
    } finally {
      this.creatingNote = false;
      this.endOperation();
    }

    if (!created.created) {
      this.statusBar.content = t`${fg(this.theme.fgMuted)(`Create cancelled: ${draft.entry.filename}`)}`;
      return;
    }

    const matchesActiveFilter = this.visibleEntries.some(
      (entry) => entry.filePath === draft.entry.filePath,
    );
    const outcome = noteGitOutcome(git);
    const message = `${outcome?.complete ? "Created" : "Created locally"} ${draft.entry.filename}${matchesActiveFilter ? "" : " (hidden by current filter)"}${outcome && !outcome.complete ? `; ${outcome.detail}` : ""}`;
    if (!outcome.complete) this.showAcknowledgement(message);
    else
      this.statusBar.content = t`${fg(matchesActiveFilter ? this.theme.green : this.theme.yellow)(message)}`;
  }

  private requestChangePriority(): void {
    if (this.activeOperation) {
      this.showActiveOperation();
      return;
    }
    const entry = this.selectedEntry;
    if (!entry) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Select a note before changing priority")}`;
      return;
    }
    this.noteList.setActive(false);
    this.bodyScroll.blur();
    this.priorityPopup.show(
      notePriority(entry),
      entry.name ?? stripMarkdownExtension(entry.filename),
    );
  }

  private cancelChangePriority(): void {
    this.statusBar.content = t`${fg(this.theme.fgMuted)("Priority change cancelled")}`;
    this.focusPane(this.activePane);
  }

  private async executeSetPriority(priority: NotePriority): Promise<void> {
    const entry = this.selectedEntry;
    if (!entry) {
      this.focusPane(this.activePane);
      return;
    }
    if (!this.beginOperation(`setting ${notePathLabel(entry)} priority`))
      return;
    this.settingPriorityPath = entry.filePath;
    this.selectedFilePath = entry.filePath;
    const label = notePathLabel(entry);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Setting ${label} to ${priorityLabel(priority)}...`)}`;
    this.focusPane(this.activePane);
    try {
      const result = await this.callbacks.onSetPriority(
        entry.filePath,
        priority,
      );
      await this.refresh();
      const outcome = noteGitOutcome(result);
      const message = `Set ${label} priority to ${priorityLabel(priority)}${outcome.complete ? "" : `; ${outcome.detail}`}`;
      if (!outcome.complete) this.showAcknowledgement(message);
      else this.statusBar.content = t`${fg(this.theme.green)(message)}`;
    } catch (error) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to set priority: ${errorMessage(error)}`)}`;
    } finally {
      this.settingPriorityPath = null;
      this.endOperation();
    }
  }

  private requestDeleteSelected(): void {
    if (this.activeOperation) {
      this.showActiveOperation();
      return;
    }
    const entry = this.selectedEntry;
    if (!entry) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Select a note before deleting")}`;
      return;
    }
    this.deleteConfirmation = entry;
    this.showDeletePrompt(entry);
  }

  private async requestMoveSelected(): Promise<void> {
    if (this.activeOperation) {
      this.showActiveOperation();
      return;
    }
    const entry = this.selectedEntry;
    if (!entry) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Select a note before moving")}`;
      return;
    }
    try {
      const currentRepoSlug = entry.repoSlug;
      const targets = (await this.callbacks.listMoveTargets()).filter(
        (target) => target !== currentRepoSlug,
      );
      if (targets.length === 0) {
        this.statusBar.content = t`${fg(this.theme.yellow)("No other known move destinations")}`;
        return;
      }
      this.noteList.setActive(false);
      this.bodyScroll.blur();
      this.movePopup.show(targets, notePathLabel(entry));
    } catch (error) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to list move destinations: ${errorMessage(error)}`)}`;
    }
  }

  private cancelMove(): void {
    this.statusBar.content = t`${fg(this.theme.fgMuted)("Move cancelled")}`;
    this.focusPane(this.activePane);
  }

  private async executeMove(repoSlug: string): Promise<void> {
    const entry = this.selectedEntry;
    if (!entry || !this.beginOperation(`moving ${notePathLabel(entry)}`)) {
      this.focusPane(this.activePane);
      return;
    }
    const label = notePathLabel(entry);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Moving ${label} to ${repoSlug}...`)}`;
    try {
      const result = await this.callbacks.moveNote(entry.filePath, repoSlug);
      this.selectedFilePath = result.path;
      await this.refresh();
      const outcome = noteGitOutcome(result);
      const message = `Moved ${entry.filename} to ${repoSlug}${outcome.complete ? "" : `; ${outcome.detail}`}`;
      if (!outcome.complete) this.showAcknowledgement(message);
      else this.statusBar.content = t`${fg(this.theme.green)(message)}`;
    } catch (error) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to move ${label}: ${errorMessage(error)}`)}`;
    } finally {
      this.endOperation();
      this.focusPane(this.activePane);
    }
  }

  private async confirmDeleteSelected(): Promise<void> {
    const entry = this.deleteConfirmation;
    if (!entry || !this.beginOperation(`deleting ${notePathLabel(entry)}`))
      return;
    this.deletingFilePath = entry.filePath;
    this.clearDeleteConfirmation();
    this.loadVersion += 1;
    const label = notePathLabel(entry);
    this.statusBar.content = t`${fg(this.theme.yellow)(`Deleting ${label}...`)}`;
    try {
      const nextSelectedFilePath = this.nextSelectedFilePathAfterDelete(
        entry.filePath,
      );
      const result = await this.callbacks.deleteNote(entry.filePath);
      this.clearDeletedSelection(entry.filePath, nextSelectedFilePath);
      if (await this.refresh()) this.showDeleteSuccess(label, result);
    } catch (error) {
      this.statusBar.content = t`${fg(this.theme.red)(`Failed to delete ${label}: ${errorMessage(error)}`)}`;
    } finally {
      this.deletingFilePath = null;
      this.endOperation();
    }
  }

  private nextSelectedFilePathAfterDelete(filePath: string): string | null {
    const deletedIndex = this.visibleEntries.findIndex(
      (entry) => entry.filePath === filePath,
    );
    if (deletedIndex === -1) return null;
    return (
      this.visibleEntries[deletedIndex + 1]?.filePath ??
      this.visibleEntries[deletedIndex - 1]?.filePath ??
      null
    );
  }

  private clearDeletedSelection(
    deletedFilePath: string,
    nextSelectedFilePath: string | null,
  ): void {
    if (this.selectedFilePath === deletedFilePath)
      this.selectedFilePath = nextSelectedFilePath;
    if (this.selectedEntry?.filePath === deletedFilePath)
      this.selectedEntry = null;
    if (this.loadedNoteContentPath === deletedFilePath) {
      this.loadedNoteContent = null;
      this.loadedNoteContentPath = null;
    }
  }

  private showDeleteSuccess(label: string, result: NoteDeleteResult): void {
    const outcome = noteGitOutcome(result);
    const message = `Deleted ${label}${outcome.complete ? "" : `; ${outcome.detail}`}`;
    if (!outcome.complete) this.showAcknowledgement(message);
    else this.statusBar.content = t`${fg(this.theme.green)(message)}`;
  }

  private showDeletePrompt(entry: NoteEntry): void {
    this.deletePrompt.show(notePathLabel(entry));
    this.noteList.setActive(false);
    this.bodyScroll.blur();
  }

  private cancelDeleteConfirmation(): void {
    const entry = this.deleteConfirmation;
    this.clearDeleteConfirmation();
    if (entry)
      this.statusBar.content = t`${fg(this.theme.fgMuted)(`Delete cancelled: ${notePathLabel(entry)}`)}`;
  }

  private clearDeleteConfirmation(refocus = true): void {
    this.deleteConfirmation = null;
    this.deletePrompt.hide();
    if (refocus && this.isVisible) this.focusPane(this.activePane);
  }

  private handleKeyPress(key: KeyEvent): void {
    if (!this.isVisible) return;
    if (Dialog.handleTopmostKey(key)) return;
    if (this.layout.mode === "minimum") {
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        key.preventDefault();
        this.callbacks.onBack();
      }
      return;
    }
    if (this.acknowledgement) {
      key.preventDefault();
      this.acknowledgement = null;
      this.updateStatusBar();
      return;
    }
    if (this.activeOperation) {
      key.preventDefault();
      this.showActiveOperation();
      return;
    }
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      this.callbacks.onBack();
      return;
    }
    if (
      this.createPrompt.visible ||
      this.priorityPopup.visible ||
      this.movePopup.visible ||
      this.deletePrompt.visible ||
      this.helpDialog.visible
    )
      return;
    if (this.searchActive) {
      key.preventDefault();
      this.handleSearchKey(key);
      return;
    }
    if (
      this.activePane === "list" &&
      ["up", "down", "pageup", "pagedown", "return"].includes(key.name)
    ) {
      key.preventDefault();
      this.noteList.handleKeyPress(key);
      return;
    }
    if (
      this.activePane === "content" &&
      ["up", "down", "pageup", "pagedown", "home", "end"].includes(key.name)
    ) {
      key.preventDefault();
      this.bodySurface.handleKeyPress(key);
      return;
    }
    this.keyHandlers[`${key.shift ? "shift+" : ""}${key.name}`]?.();
  }

  private beginOperation(label: string): boolean {
    if (this.activeOperation) {
      this.showActiveOperation();
      return false;
    }
    this.activeOperation = label;
    return true;
  }

  private endOperation(): void {
    this.activeOperation = null;
  }

  private showActiveOperation(): void {
    this.statusBar.content = t`${fg(this.theme.yellow)(`${this.activeOperation ?? "An operation"} is still in progress`)}`;
  }

  private showAcknowledgement(message: string): void {
    this.acknowledgement = message;
    this.statusBar.content = t`${fg(this.theme.yellow)(`${message}. Press any key to acknowledge`)}`;
  }

  private focusPane(pane: NotesPane): void {
    this.activePane = pane;
    if (this.layout.mode === "master-detail") {
      this.leftPane.visible = pane === "list";
      this.rightPane.visible = pane === "content";
    }
    this.noteList.setActive(pane === "list");
    if (pane === "content") this.bodyScroll.focus();
    else this.bodyScroll.blur();
    this.updatePaneTitles();
    this.commandBar.update(
      this.currentStatusText(),
      this.searchActive ? "search" : pane,
      COMMANDS,
    );
  }

  private listItem(
    entry: NoteEntry,
    showSection: boolean,
  ): StatusListItem<NoteEntry> {
    return {
      id: entry.filePath,
      title: entry.name ?? stripMarkdownExtension(entry.filename),
      description: formatListDescription(entry),
      color: priorityColor(this.theme, notePriority(entry)),
      section: this.listItemSection(entry, showSection),
      value: entry,
    };
  }

  private listItemSection(
    entry: NoteEntry,
    showSection: boolean,
  ): string | undefined {
    if (!showSection) return undefined;
    if (this.groupingByPriority()) return priorityLabel(notePriority(entry));
    return this.groupingByRepo() ? entry.repoSlug : undefined;
  }

  private updateHeader(entry: NoteEntry): void {
    const name = entry.name ?? stripMarkdownExtension(entry.filename);
    const modified = formatLocalNoteDateTimeFromEpochSeconds(entry.mtime);
    this.noteHeading.content = t`${bold(fg(this.theme.accent)(name))}`;
    this.noteSummary.content = t`${fg(priorityColor(this.theme, notePriority(entry)))(priorityLabel(notePriority(entry)))}  ${fg(this.theme.fgMuted)(formatTags(entry.tags))}`;
    this.noteDescription.content = entry.description
      ? t`${fg(this.theme.fgMuted)("Description: ")}${fg(this.theme.fg)(entry.description)}`
      : t`${fg(this.theme.fgMuted)("Description: ")}${fg(this.theme.fgSubtle)("No description")}`;
    this.noteTags.content = t`${fg(this.theme.fgMuted)("Tags: ")}${fg(this.theme.fg)(formatTags(entry.tags))}`;
    const priority = notePriority(entry);
    this.notePriorityText.content = t`${fg(this.theme.fgMuted)("Priority: ")}${bold(fg(priorityColor(this.theme, priority))(priorityLabel(priority)))}`;
    this.noteFile.content = t`${fg(this.theme.fgMuted)("File: ")}${fg(this.theme.fg)(notePathLabel(entry))}`;
    this.noteModified.content = t`${fg(this.theme.fgMuted)("Modified: ")}${fg(this.theme.fg)(modified)}`;
  }

  private showEmptyContent(title: string, body: string): void {
    this.selectedEntry = null;
    this.loadedNoteContent = null;
    this.loadedNoteContentPath = null;
    this.noteHeading.content = t`${bold(fg(this.theme.fgMuted)(title))}`;
    this.noteSummary.content = t``;
    this.noteDescription.content = t``;
    this.noteTags.content = t``;
    this.notePriorityText.content = t``;
    this.noteFile.content = t``;
    this.noteModified.content = t``;
    this.setMarkdownContent(body);
    this.bodyScroll.scrollTo(0);
    this.updatePaneTitles();
  }

  private updatePaneTitles(): void {
    const query = this.searchQuery.trim();
    const detail =
      this.searchActive || query.length > 0
        ? `search "${query}"`
        : this.groupMode === "none"
          ? sortModeLabel(this.sortMode)
          : `group:${this.groupMode} | ${sortModeLabel(this.sortMode)}`;
    this.listTitle.update(
      `${notesDisplayTitle(this.filter, this.showingAllRepos)} | ${detail}`,
      `${this.visibleEntries.length}`,
      this.activePane === "list",
    );
    this.contentTitle.update(
      "Content",
      this.selectedEntry ? "1" : "0",
      this.activePane === "content",
    );
  }

  private updateStatusBar(): void {
    if (this.searchActive && this.searchQuery.trim().length === 0) {
      this.statusBar.content = t`${fg(this.theme.yellow)("Search:")}${fg(this.theme.fgMuted)(" type to filter")}    ${fg(this.theme.fgSubtle)("Enter/Esc exit")}`;
      return;
    }
    if (this.visibleEntries.length === 0) {
      this.statusBar.content = t`${fg(this.theme.fgMuted)(this.emptyBody())}`;
      return;
    }
    const query = this.searchQuery.trim();
    if (query.length > 0) {
      const count = this.visibleEntries.length;
      const hint = this.searchActive
        ? "type to filter | Enter/Esc exit"
        : "/ edit search";
      this.statusBar.content = t`${fg(this.theme.fgMuted)(`${count} ${matchLabel(count)} for "${query}"`)}    ${fg(this.theme.fgSubtle)(hint)}`;
      return;
    }
    this.statusBar.content = t`${fg(this.theme.fgMuted)(formatStatusBarText(this.visibleEntries.length, this.selectedEntry, this.filter, this.showingAllRepos, this.usingAllReposFallback))}`;
    this.commandBar.update(
      this.currentStatusText(),
      this.searchActive ? "search" : this.activePane,
      COMMANDS,
    );
  }

  private currentStatusText(): string {
    if (this.searchActive)
      return this.searchQuery
        ? `Search: ${this.searchQuery}`
        : "Search: type to filter";
    if (!this.visibleEntries.length) return this.emptyBody();
    return formatStatusBarText(
      this.visibleEntries.length,
      this.selectedEntry,
      this.filter,
      this.showingAllRepos,
      this.usingAllReposFallback,
    );
  }

  private emptyTitle(): string {
    if (this.searchQuery.trim().length > 0) return "No matches";
    return `No ${notesDisplayTitle(this.filter, this.showingAllRepos)}`;
  }

  private emptyBody(): string {
    const query = this.searchQuery.trim();
    if (query.length > 0) return `No notes match "${query}".`;
    if (this.showingAllRepos) {
      return this.filter?.tag
        ? `No notes tagged ${this.filter.tag} found in any repository.`
        : "No notes found in any repository.";
    }
    return this.filter?.tag
      ? `No notes tagged ${this.filter.tag} found for this repository.`
      : "No notes found for this repository.";
  }

  private updateAppHeader(): void {
    this.appHeader.setContent(
      notesDisplayTitle(this.filter, this.showingAllRepos),
      notesSubtitle(this.filter, this.showingAllRepos),
    );
  }

  private setMarkdownContent(content: string): void {
    this.markdown.content = content;
  }
}

function createMarkdownSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    default: { fg: theme.fg },
    conceal: { fg: theme.fgMuted },
    "markup.heading": { fg: theme.accent, bold: true },
    "markup.strong": { bold: true },
    "markup.italic": { italic: true },
    "markup.raw": { fg: theme.green },
    "markup.link": { fg: theme.accent, underline: true },
    "markup.link.label": { fg: theme.accent, underline: true },
    "markup.link.url": { fg: theme.fgMuted, dim: true },
  });
}

function matchesFilter(
  entry: NoteEntry,
  filter: NotesViewFilter | null,
): boolean {
  if (!filter?.tag) return true;
  const wanted = filter.tag.toLowerCase();
  return entry.tags.some((tag) => tag.toLowerCase() === wanted);
}

function sortComparator(
  mode: NoteSortMode,
): (a: NoteEntry, b: NoteEntry) => number {
  switch (mode) {
    case "modified-desc":
      return (a, b) => b.mtime - a.mtime;
    case "modified-asc":
      return (a, b) => a.mtime - b.mtime;
    case "name-asc":
      return (a, b) =>
        noteSortName(a).localeCompare(noteSortName(b), undefined, {
          numeric: true,
        });
    case "name-desc":
      return (a, b) =>
        noteSortName(b).localeCompare(noteSortName(a), undefined, {
          numeric: true,
        });
  }
}

function noteSortName(entry: NoteEntry): string {
  return (entry.name ?? stripMarkdownExtension(entry.filename)).toLowerCase();
}

function sortModeLabel(mode: NoteSortMode): string {
  switch (mode) {
    case "modified-desc":
      return "modified down";
    case "modified-asc":
      return "modified up";
    case "name-asc":
      return "name up";
    case "name-desc":
      return "name down";
  }
}

function flattenNoteSections(
  sections: readonly NoteRepoSection[],
): readonly NoteEntry[] {
  return sections.flatMap((section) => section.entries);
}

function splitNoteBody(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? content.slice(match[0].length) : content;
}

function stripH1Headings(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^#(?!#)\s+/.test(line))
    .join("\n");
}

function noteBodyContent(content: string): string {
  const body = stripH1Headings(splitNoteBody(content)).trim();
  return body || "No content after frontmatter.";
}

function notesDisplayTitle(
  filter: NotesViewFilter | null,
  showingAllRepos: boolean,
): string {
  const title = filter?.title ?? "Notes";
  if (!showingAllRepos) return title;
  return title.startsWith("All ") ? title : `All ${title}`;
}

function notesSubtitle(
  filter: NotesViewFilter | null,
  showingAllRepos: boolean,
): string {
  const scope = showingAllRepos ? "all repos" : "repo notes";
  return filter?.tag ? `tag:${filter.tag} | ${scope}` : scope;
}

function formatStatusBarText(
  count: number,
  selectedEntry: NoteEntry | null,
  filter: NotesViewFilter | null,
  showingAllRepos: boolean,
  usingAllReposFallback: boolean,
): string {
  return `${count} ${noteLabel(count)}${filterStatusText(filter, showingAllRepos, usingAllReposFallback)}    ${selectedStatusText(selectedEntry)}`;
}

function noteLabel(count: number): string {
  return count === 1 ? "note" : "notes";
}

function matchLabel(count: number): string {
  return count === 1 ? "match" : "matches";
}

function filterStatusText(
  filter: NotesViewFilter | null,
  showingAllRepos: boolean,
  usingAllReposFallback: boolean,
): string {
  const parts = [
    ...(filter?.tag ? [`tag:${filter.tag}`] : []),
    ...(showingAllRepos
      ? [usingAllReposFallback ? "all repos fallback" : "all repos"]
      : []),
  ];
  return parts.length ? ` | ${parts.join(" | ")}` : "";
}

function selectedStatusText(entry: NoteEntry | null): string {
  return entry ? `Selected: ${notePathLabel(entry)}` : "Select a note";
}

function formatListDescription(entry: NoteEntry): string {
  const description = entry.description ?? "No description";
  const tags = entry.tags.length ? ` [${entry.tags.join(", ")}]` : "";
  return `${description}${tags} | ${formatLocalNoteDateTimeFromEpochSeconds(entry.mtime)}`;
}

function formatTags(tags: readonly string[]): string {
  return tags.length > 0 ? tags.join(", ") : "untagged";
}

function notePathLabel(entry: NoteEntry): string {
  return entry.repoSlug
    ? `${entry.repoSlug}/${entry.filename}`
    : entry.filename;
}

function stripMarkdownExtension(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

function errorMessage<Failure>(error: Failure): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
