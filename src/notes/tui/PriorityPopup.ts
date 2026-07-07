import {
  type CliRenderer,
  BoxRenderable,
  TextRenderable,
  type KeyEvent,
  t,
  bold,
  dim,
  fg,
} from "@opentui/core";
import type { Theme } from "../../theme.js";
import { PRIORITY_LEVELS, priorityLabel, type NotePriority } from "../types.js";
import { StatusList } from "../../tui/StatusList.js";

const POPUP_WIDTH = 50;

const PRIORITY_DESCRIPTIONS: Readonly<Record<NotePriority, string>> = {
  critical: "Highest urgency, handle before anything else",
  high: "Important, pick up soon",
  medium: "Normal priority (default)",
  low: "Can wait for higher-priority work",
};

/** Resolve the accent colour used to render a priority level. */
export function priorityColor(theme: Theme, priority: NotePriority): string {
  switch (priority) {
    case "critical":
      return theme.red;
    case "high":
      return theme.yellow;
    case "medium":
      return theme.accent;
    case "low":
      return theme.green;
  }
}

/** Configuration for {@link PriorityPopup}. */
export interface PriorityPopupOptions {
  /** Called when the user selects a priority. */
  readonly onSelect: (priority: NotePriority) => void;
  /** Called when the popup is dismissed without a selection. */
  readonly onDismiss: () => void;
}

/** Centred popup overlay for choosing a note priority. */
export class PriorityPopup {
  private readonly renderer: CliRenderer;
  private readonly theme: Theme;
  private readonly callbacks: PriorityPopupOptions;
  private readonly root: BoxRenderable;
  private readonly titleText: TextRenderable;
  private readonly list: StatusList<NotePriority>;

  constructor(
    renderer: CliRenderer,
    theme: Theme,
    options: PriorityPopupOptions,
  ) {
    this.renderer = renderer;
    this.theme = theme;
    this.callbacks = options;

    this.root = new BoxRenderable(renderer, {
      id: "priority-popup-root",
      position: "absolute",
      width: POPUP_WIDTH,
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

    this.titleText = new TextRenderable(renderer, {
      id: "priority-popup-title",
      content: t``,
      width: "100%",
      truncate: true,
      marginBottom: 1,
    });
    this.root.add(this.titleText);

    this.list = new StatusList(renderer, {
      id: "priority-popup-list",
      theme,
      onSelect: (item) => {
        this.hide();
        this.callbacks.onSelect(item.value);
      },
    });
    this.root.add(this.list);

    this.root.add(
      new TextRenderable(renderer, {
        id: "priority-popup-sep",
        content: t`${fg(theme.fgSubtle)("-".repeat(POPUP_WIDTH - 4))}`,
        marginTop: 1,
      }),
    );
    this.root.add(
      new TextRenderable(renderer, {
        id: "priority-popup-help",
        content: t`${dim("up/down")} ${dim("navigate")}  ${dim("Enter")} ${dim("select")}  ${dim("Esc")} ${dim("cancel")}`,
      }),
    );

    renderer.root.add(this.root);
  }

  /** Whether the popup is currently visible. */
  get visible(): boolean {
    return this.root.visible;
  }

  /** Show the popup for a note, pre-selecting its current priority. */
  show(current: NotePriority, noteName: string): void {
    const label =
      noteName.length > 30 ? `${noteName.slice(0, 29)}...` : noteName;
    this.titleText.content = label
      ? t`${bold(fg(this.theme.accent)("Set Priority"))}  ${fg(this.theme.fgMuted)(label)}`
      : t`${bold(fg(this.theme.accent)("Set Priority"))}`;

    this.list.setItems(
      PRIORITY_LEVELS.map((priority) => ({
        id: priority,
        title: priorityLabel(priority),
        description: PRIORITY_DESCRIPTIONS[priority],
        color: priorityColor(this.theme, priority),
        value: priority,
      })),
      current,
    );

    const totalHeight = PRIORITY_LEVELS.length * 2 + 7;
    this.root.top = Math.max(
      1,
      Math.floor((this.renderer.height - totalHeight) / 2),
    );
    this.root.left = Math.max(
      1,
      Math.floor((this.renderer.width - POPUP_WIDTH) / 2),
    );
    this.root.height = totalHeight;
    this.root.visible = true;
    this.list.setActive(true);
  }

  /** Hide the popup and release focus. */
  hide(): void {
    this.root.visible = false;
    this.list.setActive(false);
  }

  /** Handle keyboard input when the popup has focus. */
  handleKeyPress(key: KeyEvent): boolean {
    switch (key.name) {
      case "escape":
      case "backspace":
        this.hide();
        this.callbacks.onDismiss();
        return true;
      default:
        return false;
    }
  }

  /** Remove the popup from the render tree. */
  destroy(): void {
    this.hide();
    this.renderer.root.remove(this.root);
  }
}
