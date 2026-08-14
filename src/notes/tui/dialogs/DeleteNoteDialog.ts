import {
  BoxRenderable,
  TextRenderable,
  fg,
  t,
  type CliRenderer,
} from "@opentui/core";
import type { Theme } from "../../../theme.js";
import { Button } from "../../../tui/components/Button.js";
import { Dialog } from "../../../tui/components/Dialog.js";

export class DeleteNoteDialog {
  private readonly dialog: Dialog;
  private readonly file: TextRenderable;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    onConfirm: () => void,
    onDismiss: () => void,
  ) {
    this.dialog = new Dialog(renderer, {
      id: "delete-note-dialog",
      theme,
      title: "Delete note?",
      description: "This removes the note from the vault.",
      width: 58,
      height: 8,
      onDismiss,
    });
    this.file = new TextRenderable(renderer, {
      height: 1,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    const actions = new BoxRenderable(renderer, {
      flexDirection: "row",
      height: 1,
      gap: 1,
    });
    const remove = new Button(renderer, {
      id: "delete-note-confirm",
      theme,
      label: "Delete",
      variant: "destructive",
      onPress: () => {
        this.dialog.hide();
        onConfirm();
      },
    });
    const cancel = new Button(renderer, {
      id: "delete-note-cancel",
      theme,
      label: "Cancel",
      onPress: () => this.dialog.dismiss(),
    });
    actions.add(remove);
    actions.add(cancel);
    this.dialog.body.add(this.file);
    this.dialog.body.add(actions);
    this.dialog.registerFocusable(remove, true);
    this.dialog.registerFocusable(cancel);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }
  show(file: string): void {
    this.file.content = t`${fg("#a6adc8")(file)}`;
    this.dialog.show();
  }
  hide(): void {
    this.dialog.hide();
  }
  destroy(): void {
    this.dialog.destroy();
  }
}
