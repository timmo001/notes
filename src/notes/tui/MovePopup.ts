import {
  type CliRenderer,
  BoxRenderable,
  TextRenderable,
  type KeyEvent,
  t,
  bold,
  dim,
} from "@opentui/core";
import type { Theme } from "../../theme.js";
import { StatusList } from "../../tui/StatusList.js";

const POPUP_WIDTH = 58;

export interface MovePopupOptions {
  readonly onSelect: (repoSlug: string) => void;
  readonly onDismiss: () => void;
}

/** Centred popup for choosing a known repository note destination. */
export class MovePopup {
  private readonly renderer: CliRenderer;
  private readonly theme: Theme;
  private readonly root: BoxRenderable;
  private readonly title: TextRenderable;
  private readonly list: StatusList<string>;
  private readonly onDismiss: () => void;

  constructor(renderer: CliRenderer, theme: Theme, options: MovePopupOptions) {
    this.renderer = renderer;
    this.theme = theme;
    this.onDismiss = options.onDismiss;
    this.root = new BoxRenderable(renderer, {
      id: "move-popup-root",
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
    });
    this.title = new TextRenderable(renderer, {
      id: "move-popup-title",
      content: t``,
      width: "100%",
      truncate: true,
      marginBottom: 1,
    });
    this.root.add(this.title);
    this.list = new StatusList(renderer, {
      id: "move-popup-list",
      theme,
      onSelect: (item) => {
        this.hide();
        options.onSelect(item.value);
      },
    });
    this.root.add(this.list);
    this.root.add(
      new TextRenderable(renderer, {
        id: "move-popup-help",
        content: t`${dim("up/down")} ${dim("navigate")}  ${dim("Enter")} ${dim("move")}  ${dim("Esc")} ${dim("cancel")}`,
        marginTop: 1,
      }),
    );
    renderer.root.add(this.root);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  show(targets: readonly string[], noteName: string): void {
    this.title.content = t`${bold("Move Note")}  ${noteName}`;
    this.list.setItems(
      targets.map((target) => ({
        id: target,
        title: target,
        description: `projects/${target}`,
        color: this.theme.accent,
        value: target,
      })),
    );
    const height = Math.min(this.renderer.height - 2, targets.length * 2 + 6);
    this.root.height = height;
    this.root.top = Math.max(
      1,
      Math.floor((this.renderer.height - height) / 2),
    );
    this.root.left = Math.max(
      1,
      Math.floor((this.renderer.width - POPUP_WIDTH) / 2),
    );
    this.root.visible = true;
    this.list.setActive(true);
  }

  hide(): void {
    this.root.visible = false;
    this.list.setActive(false);
  }

  handleKeyPress(key: KeyEvent): boolean {
    if (key.name !== "escape" && key.name !== "backspace") return false;
    this.hide();
    this.onDismiss();
    return true;
  }

  destroy(): void {
    this.hide();
    this.renderer.root.remove(this.root);
  }
}
