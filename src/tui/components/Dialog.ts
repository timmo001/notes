import {
  BoxRenderable,
  CliRenderEvents,
  TextRenderable,
  bold,
  fg,
  t,
  type CliRenderer,
  type KeyEvent,
  type Renderable,
} from "@opentui/core";
import type { Theme } from "../../theme.js";

export interface DialogOptions {
  readonly id: string;
  readonly theme: Theme;
  readonly title: string;
  readonly description?: string;
  readonly width?: number;
  readonly height?: number;
  readonly onDismiss: () => void;
}

/** Native fallback for TUI Parts Dialog keyboard handling on OpenTUI 0.5. */
export class Dialog {
  private static stack: Dialog[] = [];
  readonly root: BoxRenderable;
  readonly popup: BoxRenderable;
  readonly body: BoxRenderable;
  private readonly renderer: CliRenderer;
  private readonly options: DialogOptions;
  private focusables: Renderable[] = [];
  private previousFocus: Renderable | undefined;
  private readonly keyHandler: (key: KeyEvent) => void;
  private readonly resizeHandler: () => void;

  constructor(renderer: CliRenderer, options: DialogOptions) {
    this.renderer = renderer;
    this.options = options;
    this.root = new BoxRenderable(renderer, {
      id: options.id,
      position: "absolute",
      width: "100%",
      height: "100%",
      zIndex: 160,
      visible: false,
      backgroundColor: options.theme.bg,
      onMouseDown: (event) => {
        if (event.target === this.root) this.dismiss();
      },
    });
    this.popup = new BoxRenderable(renderer, {
      id: `${options.id}-popup`,
      position: "absolute",
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: options.theme.accent,
      backgroundColor: options.theme.bgElevated,
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.popup.add(
      new TextRenderable(renderer, {
        id: `${options.id}-title`,
        content: t`${bold(fg(options.theme.accent)(options.title))}`,
        height: 1,
        flexShrink: 0,
        truncate: true,
        wrapMode: "none",
      }),
    );
    if (options.description) {
      this.popup.add(
        new TextRenderable(renderer, {
          id: `${options.id}-description`,
          content: t`${fg(options.theme.fgMuted)(options.description)}`,
          height: 1,
          flexShrink: 0,
          truncate: true,
          wrapMode: "none",
        }),
      );
    }
    this.body = new BoxRenderable(renderer, {
      id: `${options.id}-body`,
      flexDirection: "column",
      width: "100%",
      flexGrow: 1,
      minHeight: 0,
      marginTop: 1,
    });
    this.popup.add(this.body);
    this.root.add(this.popup);
    renderer.root.add(this.root);
    this.keyHandler = (key) => this.handleKey(key);
    this.resizeHandler = () => {
      if (this.visible) this.measure();
    };
    renderer.keyInput.prependListener("keypress", this.keyHandler);
    renderer.on(CliRenderEvents.RESIZE, this.resizeHandler);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  static handleTopmostKey(key: KeyEvent): boolean {
    const dialog = Dialog.stack.at(-1);
    if (!dialog) return false;
    dialog.handleKey(key);
    return true;
  }

  registerFocusable(target: Renderable, initial = false): void {
    if (initial) this.focusables.unshift(target);
    else this.focusables.push(target);
  }

  /** Replace the focus cycle for the currently visible dialog stage. */
  setFocusables(targets: readonly Renderable[], initial?: Renderable): void {
    this.focusables = initial
      ? [initial, ...targets.filter((target) => target !== initial)]
      : [...targets];
    if (this.visible) this.liveFocusables()[0]?.focus();
  }

  show(): void {
    this.previousFocus = this.renderer.currentFocusedRenderable ?? undefined;
    this.measure();
    this.root.visible = true;
    Dialog.stack.push(this);
    this.liveFocusables()[0]?.focus();
  }

  hide(restoreFocus = true): void {
    this.root.visible = false;
    Dialog.stack = Dialog.stack.filter((dialog) => dialog !== this);
    if (restoreFocus) this.previousFocus?.focus();
  }

  dismiss(): void {
    this.hide();
    this.options.onDismiss();
  }

  destroy(): void {
    this.hide(false);
    this.renderer.keyInput.off("keypress", this.keyHandler);
    this.renderer.off(CliRenderEvents.RESIZE, this.resizeHandler);
    this.renderer.root.remove(this.root);
  }

  private handleKey(key: KeyEvent): void {
    if (!this.visible || Dialog.stack.at(-1) !== this) return;
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      this.dismiss();
      return;
    }
    const focusables = this.liveFocusables();
    if (key.name !== "tab" || focusables.length === 0) return;
    key.preventDefault();
    key.stopPropagation();
    const current = this.renderer.currentFocusedRenderable;
    const index = Math.max(0, current ? focusables.indexOf(current) : -1);
    const delta = key.shift ? -1 : 1;
    focusables[(index + delta + focusables.length) % focusables.length].focus();
  }

  private liveFocusables(): Renderable[] {
    return this.focusables.filter((target) => {
      for (
        let current: Renderable | null = target;
        current;
        current = current.parent
      )
        if (!current.visible) return false;
      return true;
    });
  }

  private measure(): void {
    const width = Math.max(
      1,
      Math.min(this.options.width ?? 58, this.renderer.width - 4),
    );
    const height = Math.max(
      1,
      Math.min(this.options.height ?? 14, this.renderer.height - 2),
    );
    this.popup.width = width;
    this.popup.height = height;
    this.popup.left = Math.max(
      0,
      Math.floor((this.renderer.width - width) / 2),
    );
    this.popup.top = Math.max(
      0,
      Math.floor((this.renderer.height - height) / 2),
    );
  }
}
