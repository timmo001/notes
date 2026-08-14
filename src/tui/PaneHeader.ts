import { TextRenderable, bold, fg, t, type CliRenderer } from "@opentui/core";
import type { Theme } from "../theme.js";

/** Fixed one-row pane header whose active state never changes geometry. */
export class PaneHeader extends TextRenderable {
  private readonly theme: Theme;
  private label = "";
  private detail = "";
  private active = false;

  constructor(renderer: CliRenderer, id: string, theme: Theme) {
    super(renderer, {
      id,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
      bg: "transparent",
      content: "",
    });
    this.theme = theme;
  }

  update(label: string, detail: string, active: boolean): void {
    this.label = label;
    this.detail = detail;
    this.active = active;
    const marker = active ? "▶" : "·";
    this.bg = active ? this.theme.bgSelected : "transparent";
    this.content = t`${fg(active ? this.theme.accent : this.theme.fgSubtle)(marker)} ${bold(fg(active ? this.theme.fg : this.theme.fgMuted)(label))} ${fg(active ? this.theme.fgMuted : this.theme.fgSubtle)(detail)}`;
  }
}
