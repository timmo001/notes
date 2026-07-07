import {
  type CliRenderer,
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type KeyEvent,
  t,
  bold,
  dim,
  fg,
} from "@opentui/core";
import type { Theme } from "../../theme.js";
import type { NoteCreateKind } from "../types.js";
import { StatusList, type StatusListItem } from "../../tui/StatusList.js";

const PROMPT_WIDTH = 50;

interface CreateTemplateItem {
  readonly label: string;
  readonly description: string;
  readonly kind: NoteCreateKind;
}

/** Result of the create prompt: template kind plus user-provided metadata. */
export interface NoteCreatePromptResult {
  /** Selected template kind. */
  readonly kind: NoteCreateKind;
  /** User-entered note name/title. */
  readonly name: string;
  /** User-entered one-line description. */
  readonly description: string;
}

const ALL_TEMPLATES: readonly CreateTemplateItem[] = [
  {
    label: "Note",
    description: "General repository note with title and tags",
    kind: "note",
  },
  {
    label: "Handoff",
    description: "Implementation handoff with structured sections",
    kind: "handoff",
  },
];

/** Configuration callbacks for {@link NoteCreatePrompt}. */
export interface NoteCreatePromptOptions {
  /** Called when the user completes the create flow. */
  readonly onSubmit: (result: NoteCreatePromptResult) => void;
  /** Called when the prompt is dismissed without submission. */
  readonly onDismiss: () => void;
}

type PromptStage = "template" | "details";
type DetailsFocus = "name" | "description";

/** Centred popup overlay for creating a new note. */
export class NoteCreatePrompt {
  private readonly renderer: CliRenderer;
  private readonly theme: Theme;
  private readonly callbacks: NoteCreatePromptOptions;
  private readonly root: BoxRenderable;
  private readonly templateTitle: TextRenderable;
  private readonly templateList: StatusList<CreateTemplateItem>;
  private readonly templateSep: TextRenderable;
  private readonly templateHelp: TextRenderable;
  private readonly detailsTitle: TextRenderable;
  private readonly nameLabel: TextRenderable;
  private readonly nameInput: InputRenderable;
  private readonly descLabel: TextRenderable;
  private readonly descInput: InputRenderable;
  private readonly detailsSep: TextRenderable;
  private readonly detailsHelp: TextRenderable;
  private stage: PromptStage = "template";
  private detailsFocus: DetailsFocus = "name";
  private selectedKind: NoteCreateKind = "note";

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    options: NoteCreatePromptOptions,
  ) {
    this.renderer = renderer;
    this.theme = theme;
    this.callbacks = options;

    this.root = new BoxRenderable(renderer, {
      id: "note-create-prompt-root",
      position: "absolute",
      width: PROMPT_WIDTH,
      zIndex: 160,
      visible: false,
      borderStyle: "rounded",
      borderColor: theme.accent,
      backgroundColor: theme.bgElevated,
      flexDirection: "column",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    });

    this.templateTitle = new TextRenderable(renderer, {
      id: "note-create-prompt-template-title",
      content: t`${bold(fg(theme.accent)("Create Note"))}`,
      marginBottom: 1,
    });
    this.root.add(this.templateTitle);

    this.templateList = new StatusList(renderer, {
      id: "note-create-prompt-template-list",
      theme,
      onSelect: (item) => this.advanceToDetails(item.value.kind),
    });
    this.root.add(this.templateList);

    this.templateSep = new TextRenderable(renderer, {
      id: "note-create-prompt-template-sep",
      content: t`${fg(theme.fgSubtle)("-".repeat(PROMPT_WIDTH - 4))}`,
      marginTop: 1,
    });
    this.root.add(this.templateSep);

    this.templateHelp = new TextRenderable(renderer, {
      id: "note-create-prompt-template-help",
      content: t`${dim("up/down")} ${dim("navigate")}  ${dim("Enter")} ${dim("select")}  ${dim("Esc")} ${dim("cancel")}`,
    });
    this.root.add(this.templateHelp);

    this.detailsTitle = new TextRenderable(renderer, {
      id: "note-create-prompt-details-title",
      content: t`${bold(fg(theme.accent)("Note Details"))}`,
      marginBottom: 1,
      visible: false,
    });
    this.root.add(this.detailsTitle);

    this.nameLabel = new TextRenderable(renderer, {
      id: "note-create-prompt-name-label",
      content: t`${fg(theme.fgMuted)("Name:")}`,
      visible: false,
    });
    this.root.add(this.nameLabel);

    this.nameInput = new InputRenderable(renderer, {
      id: "note-create-prompt-name-input",
      width: "100%",
      placeholder: "Enter note name...",
      backgroundColor: theme.bgElevated,
      focusedBackgroundColor: theme.bgInput,
      textColor: theme.fg,
      cursorColor: theme.accent,
      visible: false,
    });
    this.root.add(this.nameInput);

    this.descLabel = new TextRenderable(renderer, {
      id: "note-create-prompt-desc-label",
      content: t`${fg(theme.fgMuted)("Description:")}`,
      marginTop: 1,
      visible: false,
    });
    this.root.add(this.descLabel);

    this.descInput = new InputRenderable(renderer, {
      id: "note-create-prompt-desc-input",
      width: "100%",
      placeholder: "One-line description (optional)...",
      backgroundColor: theme.bgElevated,
      focusedBackgroundColor: theme.bgInput,
      textColor: theme.fg,
      cursorColor: theme.accent,
      visible: false,
    });
    this.root.add(this.descInput);

    this.detailsSep = new TextRenderable(renderer, {
      id: "note-create-prompt-details-sep",
      content: t`${fg(theme.fgSubtle)("-".repeat(PROMPT_WIDTH - 4))}`,
      marginTop: 1,
      visible: false,
    });
    this.root.add(this.detailsSep);

    this.detailsHelp = new TextRenderable(renderer, {
      id: "note-create-prompt-details-help",
      content: t`${dim("Tab")} ${dim("next field")}  ${dim("Enter")} ${dim("create")}  ${dim("Esc")} ${dim("cancel")}`,
      visible: false,
    });
    this.root.add(this.detailsHelp);

    this.nameInput.on(InputRenderableEvents.ENTER, () => {
      if (!this.root.visible || this.stage !== "details") return;
      if (this.nameInput.value.trim()) this.setDetailsFocus("description");
    });
    this.descInput.on(InputRenderableEvents.ENTER, () => {
      if (!this.root.visible || this.stage !== "details") return;
      this.submit();
    });

    renderer.root.add(this.root);
  }

  /** Whether the prompt is currently visible. */
  get visible(): boolean {
    return this.root.visible;
  }

  /** Show the create prompt, optionally starting directly as a handoff. */
  show(preferHandoff: boolean): void {
    this.nameInput.value = "";
    this.descInput.value = "";
    if (preferHandoff) {
      this.selectedKind = "handoff";
      this.showDetailsStage();
    } else {
      this.showTemplateStage();
    }
  }

  /** Hide the prompt and release focus. */
  hide(): void {
    this.root.visible = false;
    this.templateList.setActive(false);
    this.nameInput.blur();
    this.descInput.blur();
  }

  /** Handle keyboard input when the prompt has focus. */
  handleKeyPress(key: KeyEvent): boolean {
    if (key.name === "escape") {
      this.hide();
      this.callbacks.onDismiss();
      return true;
    }
    if (this.stage === "details") {
      if (key.name === "tab") {
        this.setDetailsFocus(
          this.detailsFocus === "name" ? "description" : "name",
        );
        return true;
      }
      if (
        key.name === "backspace" &&
        this.detailsFocus === "name" &&
        !this.nameInput.value
      ) {
        this.showTemplateStage();
        return true;
      }
    }
    if (this.stage === "template" && key.name === "backspace") {
      this.hide();
      this.callbacks.onDismiss();
      return true;
    }
    return false;
  }

  /** Remove the prompt from the render tree. */
  destroy(): void {
    this.hide();
    this.renderer.root.remove(this.root);
  }

  private advanceToDetails(kind: NoteCreateKind): void {
    this.selectedKind = kind;
    this.showDetailsStage();
  }

  private showTemplateStage(): void {
    this.stage = "template";
    this.templateTitle.visible = true;
    this.templateList.visible = true;
    this.templateSep.visible = true;
    this.templateHelp.visible = true;
    this.detailsTitle.visible = false;
    this.nameLabel.visible = false;
    this.nameInput.visible = false;
    this.descLabel.visible = false;
    this.descInput.visible = false;
    this.detailsSep.visible = false;
    this.detailsHelp.visible = false;
    this.nameInput.blur();
    this.descInput.blur();

    this.templateList.setItems(
      ALL_TEMPLATES.map((template): StatusListItem<CreateTemplateItem> => ({
        id: template.kind,
        title: template.label,
        description: template.description,
        color: this.theme.fg,
        value: template,
      })),
    );

    this.positionRoot(ALL_TEMPLATES.length * 2 + 7);
    this.root.visible = true;
    this.templateList.setActive(true);
  }

  private showDetailsStage(): void {
    this.stage = "details";
    this.templateTitle.visible = false;
    this.templateList.visible = false;
    this.templateSep.visible = false;
    this.templateHelp.visible = false;
    this.templateList.setActive(false);

    const kindLabel = this.selectedKind === "handoff" ? "Handoff" : "Note";
    this.detailsTitle.content = t`${bold(fg(this.theme.accent)(`New ${kindLabel}`))}`;
    this.detailsTitle.visible = true;
    this.nameLabel.visible = true;
    this.nameInput.visible = true;
    this.descLabel.visible = true;
    this.descInput.visible = true;
    this.detailsSep.visible = true;
    this.detailsHelp.visible = true;

    this.positionRoot(12);
    this.root.visible = true;
    this.setDetailsFocus("name");
  }

  private setDetailsFocus(field: DetailsFocus): void {
    this.detailsFocus = field;
    if (field === "name") {
      this.nameInput.focus();
      this.descInput.blur();
    } else {
      this.descInput.focus();
      this.nameInput.blur();
    }
  }

  private submit(): void {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.setDetailsFocus("name");
      return;
    }
    const description = this.descInput.value.trim();
    this.hide();
    this.callbacks.onSubmit({ kind: this.selectedKind, name, description });
  }

  private positionRoot(height: number): void {
    this.root.top = Math.max(
      1,
      Math.floor((this.renderer.height - height) / 2),
    );
    this.root.left = Math.max(
      1,
      Math.floor((this.renderer.width - PROMPT_WIDTH) / 2),
    );
    this.root.height = height;
  }
}
