import { TextRenderable, bold, fg, t, type CliRenderer } from "@opentui/core";
import type { Theme } from "../theme.js";

export interface AppHeaderOptions {
  readonly id: string;
  readonly theme: Theme;
  readonly title: string;
  readonly scope: string;
}

/** Fixed one-row application title and scope badges. */
export class AppHeader extends TextRenderable {
  private readonly theme: Theme;

  constructor(renderer: CliRenderer, options: AppHeaderOptions) {
    super(renderer, {
      id: options.id,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    this.theme = options.theme;
    this.setContent(options.title, options.scope);
  }

  setContent(title: string, scope: string): void {
    this.content = t`${bold(fg(this.theme.accent)(title))}  ${fg(this.theme.fgSubtle)(scope)}`;
  }
}
