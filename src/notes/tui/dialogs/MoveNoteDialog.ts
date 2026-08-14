import {
  BoxRenderable,
  TextRenderable,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import type { Theme } from "../../../theme.js";
import { Button } from "../../../tui/components/Button.js";
import { Dialog } from "../../../tui/components/Dialog.js";
import { StatusList } from "../../../tui/StatusList.js";

export class MoveNoteDialog {
  private readonly dialog: Dialog;
  private readonly note: TextRenderable;
  private readonly list: StatusList<string>;
  private selected = "";
  private readonly renderer: CliRenderer;
  private readonly keyHandler: (key: KeyEvent) => void;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    onMove: (repo: string) => void,
    onDismiss: () => void,
  ) {
    this.renderer = renderer;
    this.dialog = new Dialog(renderer, {
      id: "move-note-dialog",
      theme,
      title: "Move note",
      width: 60,
      height: 16,
      onDismiss,
    });
    this.note = new TextRenderable(renderer, {
      height: 1,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    this.list = new StatusList(renderer, {
      id: "move-note-targets",
      theme,
      onSelect: (item) => {
        this.selected = item.value;
        this.dialog.hide();
        onMove(item.value);
      },
      onSelectionChanged: (item) => (this.selected = item.value),
    });
    const actions = new BoxRenderable(renderer, {
      flexDirection: "row",
      height: 1,
      flexShrink: 0,
      gap: 1,
    });
    const move = new Button(renderer, {
      id: "move-note-apply",
      theme,
      label: "Move",
      variant: "primary",
      onPress: () => {
        if (!this.selected) return;
        this.dialog.hide();
        onMove(this.selected);
      },
    });
    const cancel = new Button(renderer, {
      id: "move-note-cancel",
      theme,
      label: "Cancel",
      onPress: () => this.dialog.dismiss(),
    });
    actions.add(move);
    actions.add(cancel);
    this.dialog.body.add(this.note);
    this.dialog.body.add(this.list);
    this.dialog.body.add(actions);
    this.dialog.registerFocusable(this.list, true);
    this.dialog.registerFocusable(move);
    this.dialog.registerFocusable(cancel);
    this.keyHandler = (key) => {
      if (
        this.visible &&
        ["up", "down", "pageup", "pagedown", "return"].includes(key.name)
      )
        this.list.handleKeyPress(key);
    };
    renderer.keyInput.on("keypress", this.keyHandler);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }
  show(targets: readonly string[], note: string): void {
    this.note.content = t`${fg("#a6adc8")(note)}`;
    this.selected = targets[0] ?? "";
    this.list.setItems(
      targets.map((repo) => ({
        id: repo,
        title: repo,
        description: `projects/${repo}`,
        color: "#89b4fa",
        value: repo,
      })),
    );
    this.list.setActive(true);
    this.dialog.show();
  }
  destroy(): void {
    this.renderer.keyInput.off("keypress", this.keyHandler);
    this.dialog.destroy();
  }
}
