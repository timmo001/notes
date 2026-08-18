import {
  BoxRenderable,
  TextRenderable,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
  type Renderable,
} from "@opentui/core";
import type { Theme } from "../../../theme.js";
import { Button } from "../../../tui/components/Button.js";
import { Dialog } from "../../../tui/components/Dialog.js";
import { Input } from "../../../tui/components/Input.js";
import { RadioGroup } from "../../../tui/components/RadioGroup.js";
import type { NoteCreateKind } from "../../types.js";

export interface CreateNoteDialogResult {
  readonly kind: NoteCreateKind;
  readonly name: string;
  readonly description: string;
}

export class CreateNoteDialog {
  private readonly dialog: Dialog;
  private readonly renderer: CliRenderer;
  private readonly templates: RadioGroup<NoteCreateKind>;
  private readonly name: Input;
  private readonly description: Input;
  private readonly templateStage: BoxRenderable;
  private readonly detailsStage: BoxRenderable;
  private readonly templateFocusables: readonly Renderable[];
  private readonly detailsFocusables: readonly Renderable[];
  private kind: NoteCreateKind = "note";
  private readonly keyHandler: (key: KeyEvent) => void;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    onSubmit: (result: CreateNoteDialogResult) => void,
    onDismiss: () => void,
  ) {
    this.renderer = renderer;
    this.dialog = new Dialog(renderer, {
      id: "create-note-dialog",
      theme,
      title: "Create note",
      width: 58,
      height: 14,
      onDismiss,
    });
    this.templateStage = new BoxRenderable(renderer, {
      flexDirection: "column",
      width: "100%",
    });
    this.detailsStage = new BoxRenderable(renderer, {
      flexDirection: "column",
      width: "100%",
      visible: false,
    });
    this.templates = new RadioGroup(renderer, {
      id: "create-template",
      theme,
      value: "note",
      choices: [
        {
          value: "note",
          label: "Note",
          description: "General repository note",
        },
        {
          value: "handoff",
          label: "Handoff",
          description: "Structured implementation handoff",
        },
      ],
      onValueChange: (value) => (this.kind = value),
      onActivate: () => this.showDetails(),
    });
    const next = new Button(renderer, {
      id: "create-template-next",
      theme,
      label: "Next",
      variant: "primary",
      onPress: () => this.showDetails(),
    });
    this.templateStage.add(this.templates);
    this.templateStage.add(next);
    this.name = new Input(renderer, {
      id: "create-note-name",
      theme,
      placeholder: "Name",
      onSubmit: () => this.description.focus(),
    });
    this.description = new Input(renderer, {
      id: "create-note-description",
      theme,
      placeholder: "Description (optional)",
      onSubmit: () => submit(),
    });
    const submit = () => {
      const name = this.name.value.trim();
      if (!name) return this.name.focus();
      this.dialog.hide();
      onSubmit({
        kind: this.kind,
        name,
        description: this.description.value.trim(),
      });
    };
    const labels = [
      new TextRenderable(renderer, {
        content: t`${fg(theme.fgMuted)("Name")}`,
        height: 1,
      }),
      new TextRenderable(renderer, {
        content: t`${fg(theme.fgMuted)("Description")}`,
        height: 1,
      }),
    ];
    const actions = new BoxRenderable(renderer, {
      flexDirection: "row",
      height: 1,
      gap: 1,
    });
    const create = new Button(renderer, {
      id: "create-note-submit",
      theme,
      label: "Create",
      variant: "primary",
      onPress: submit,
    });
    const cancel = new Button(renderer, {
      id: "create-note-cancel",
      theme,
      label: "Cancel",
      onPress: () => this.dialog.dismiss(),
    });
    actions.add(create);
    actions.add(cancel);
    this.detailsStage.add(labels[0]);
    this.detailsStage.add(this.name);
    this.detailsStage.add(labels[1]);
    this.detailsStage.add(this.description);
    this.detailsStage.add(actions);
    this.dialog.body.add(this.templateStage);
    this.dialog.body.add(this.detailsStage);
    this.dialog.registerFocusable(this.templates, true);
    this.dialog.registerFocusable(next);
    this.dialog.registerFocusable(this.name);
    this.dialog.registerFocusable(this.description);
    this.dialog.registerFocusable(create);
    this.dialog.registerFocusable(cancel);
    this.templateFocusables = [this.templates, next];
    this.detailsFocusables = [this.name, this.description, create, cancel];
    this.keyHandler = (key) => {
      if (
        this.visible &&
        this.detailsStage.visible &&
        key.name === "backspace" &&
        !this.name.value
      )
        this.showTemplates();
    };
    renderer.keyInput.on("keypress", this.keyHandler);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }
  show(preferHandoff: boolean): void {
    this.name.value = "";
    this.description.value = "";
    this.kind = preferHandoff ? "handoff" : "note";
    this.templates.value = this.kind;
    if (preferHandoff) this.showDetails();
    else this.showTemplates();
    this.dialog.show();
    if (preferHandoff) this.name.focus();
  }
  destroy(): void {
    this.renderer.keyInput.off("keypress", this.keyHandler);
    this.dialog.destroy();
  }
  private showTemplates(): void {
    this.templateStage.visible = true;
    this.detailsStage.visible = false;
    this.dialog.setFocusables(this.templateFocusables, this.templates);
    this.templates.focus();
  }
  private showDetails(): void {
    this.templateStage.visible = false;
    this.detailsStage.visible = true;
    this.dialog.setFocusables(this.detailsFocusables, this.name);
    this.name.focus();
  }
}
