import { TextRenderable, bold, fg, t, type CliRenderer } from "@opentui/core";
import type { Theme } from "../../../theme.js";
import { Button } from "../../../tui/components/Button.js";
import { Dialog } from "../../../tui/components/Dialog.js";

const GROUPS = [
  ["Navigation", "up/down  navigate    Tab  switch pane    Enter  preview"],
  ["Browse", "/  search    s  sort    g  group    v  all repos    i  details"],
  ["Edit", "a/A  create    e/E  edit    p  priority    m  move    d  delete"],
  ["Application", "o/O  OpenCode    r  refresh    ?  help    Esc  back"],
] as const;

export class HelpDialog {
  private readonly dialog: Dialog;

  constructor(renderer: CliRenderer, theme: Theme, onDismiss: () => void) {
    this.dialog = new Dialog(renderer, {
      id: "help-dialog",
      theme,
      title: "Keyboard help",
      width: 72,
      height: 14,
      onDismiss,
    });
    for (const [heading, commands] of GROUPS) {
      this.dialog.body.add(
        new TextRenderable(renderer, {
          height: 1,
          content: t`${bold(fg(theme.accent)(heading))}`,
          wrapMode: "none",
        }),
      );
      this.dialog.body.add(
        new TextRenderable(renderer, {
          height: 1,
          content: t`${fg(theme.fgMuted)(commands)}`,
          wrapMode: "none",
          truncate: true,
        }),
      );
    }
    const close = new Button(renderer, {
      id: "help-dialog-close",
      theme,
      label: "Close",
      onPress: () => this.dialog.dismiss(),
    });
    this.dialog.body.add(close);
    this.dialog.registerFocusable(close, true);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }
  show(): void {
    this.dialog.show();
  }
  destroy(): void {
    this.dialog.destroy();
  }
}
