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
import type { AgentTarget } from "../../agentTargets.js";

export class AgentDialog {
  private readonly dialog: Dialog;
  private readonly note: TextRenderable;
  private readonly list: StatusList<AgentTarget>;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    onOpen: (target: AgentTarget) => void,
    onDismiss: () => void,
  ) {
    this.dialog = new Dialog(renderer, {
      id: "agent-dialog",
      theme,
      title: "Open in agent",
      width: 54,
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
      id: "agent-targets",
      theme,
      onSelect: (item) => {
        this.dialog.hide();
        onOpen(item.value);
      },
    });
    const cancel = new Button(renderer, {
      id: "agent-dialog-cancel",
      theme,
      label: "Cancel",
      onPress: () => this.dialog.dismiss(),
    });
    this.dialog.body.add(this.note);
    this.dialog.body.add(this.list);
    const actions = new BoxRenderable(renderer, {
      height: 1,
      flexShrink: 0,
    });
    actions.add(cancel);
    this.dialog.body.add(actions);
    this.dialog.registerFocusable(this.list, true);
    this.dialog.registerFocusable(cancel);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }

  show(targets: readonly AgentTarget[], note: string): void {
    this.note.content = t`${fg("#a6adc8")(note)}`;
    this.list.setItems(
      targets.map((target) => ({
        id: target.command,
        title: target.label,
        description: target.command,
        color: "#89b4fa",
        value: target,
      })),
    );
    this.list.setActive(true);
    this.dialog.show();
  }

  handleKeyPress(key: KeyEvent): void {
    if (
      this.visible &&
      ["up", "down", "pageup", "pagedown", "return"].includes(key.name)
    )
      this.list.handleKeyPress(key);
  }

  destroy(): void {
    this.dialog.destroy();
  }
}
