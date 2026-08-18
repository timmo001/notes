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
import { RadioGroup } from "../../../tui/components/RadioGroup.js";
import {
  PRIORITY_LEVELS,
  priorityLabel,
  type NotePriority,
} from "../../types.js";

const DESCRIPTIONS = {
  critical: "Highest urgency, handle first",
  high: "Important, pick up soon",
  medium: "Normal priority",
  low: "Can wait",
} satisfies Readonly<Record<NotePriority, string>>;

export function priorityColor(theme: Theme, priority: NotePriority): string {
  return priority === "critical"
    ? theme.red
    : priority === "high"
      ? theme.yellow
      : priority === "low"
        ? theme.green
        : theme.accent;
}

export interface PriorityDialogOptions {
  readonly onApply: (priority: NotePriority) => void;
  readonly onDismiss: () => void;
}

export class PriorityDialog {
  private readonly dialog: Dialog;
  private readonly title: TextRenderable;
  private readonly choices: RadioGroup<NotePriority>;
  private selected: NotePriority = "medium";

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    options: PriorityDialogOptions,
  ) {
    this.dialog = new Dialog(renderer, {
      id: "priority-dialog",
      theme,
      title: "Set priority",
      width: 54,
      height: 14,
      onDismiss: options.onDismiss,
    });
    this.title = new TextRenderable(renderer, {
      height: 1,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    this.choices = new RadioGroup(renderer, {
      id: "priority-dialog-choices",
      theme,
      value: this.selected,
      choices: PRIORITY_LEVELS.map((priority) => ({
        value: priority,
        label: priorityLabel(priority),
        description: DESCRIPTIONS[priority],
        color: priorityColor(theme, priority),
      })),
      onValueChange: (value) => (this.selected = value),
    });
    const actions = new BoxRenderable(renderer, {
      flexDirection: "row",
      height: 1,
      flexShrink: 0,
      gap: 1,
    });
    const apply = new Button(renderer, {
      id: "priority-dialog-apply",
      theme,
      label: "Apply",
      variant: "primary",
      onPress: () => {
        this.dialog.hide();
        options.onApply(this.selected);
      },
    });
    const cancel = new Button(renderer, {
      id: "priority-dialog-cancel",
      theme,
      label: "Cancel",
      onPress: () => this.dialog.dismiss(),
    });
    actions.add(apply);
    actions.add(cancel);
    this.dialog.body.add(this.title);
    this.dialog.body.add(this.choices);
    this.dialog.body.add(actions);
    this.dialog.registerFocusable(this.choices, true);
    this.dialog.registerFocusable(apply);
    this.dialog.registerFocusable(cancel);
  }

  get visible(): boolean {
    return this.dialog.visible;
  }
  show(current: NotePriority, noteName: string): void {
    this.selected = current;
    this.choices.value = current;
    this.title.content = t`${fg("#a6adc8")(noteName)}`;
    this.dialog.show();
  }
  destroy(): void {
    this.dialog.destroy();
  }
}
