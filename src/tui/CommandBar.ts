import {
  BoxRenderable,
  TextRenderable,
  fg,
  t,
  type CliRenderer,
} from "@opentui/core";
import type { Theme } from "../theme.js";

export type CommandContext = "list" | "content" | "search" | "minimum";

export interface CommandHint {
  readonly key: string;
  readonly action: string;
  readonly contexts: readonly CommandContext[];
  readonly priority: number;
}

/** Two fixed rows for status and width-aware contextual commands. */
export class CommandBar extends BoxRenderable {
  private readonly renderer: CliRenderer;
  private readonly theme: Theme;
  readonly status: TextRenderable;
  private readonly hints: TextRenderable;
  private statusText = "";
  private context: CommandContext = "list";
  private commands: readonly CommandHint[] = [];

  constructor(renderer: CliRenderer, id: string, theme: Theme) {
    super(renderer, {
      id,
      flexDirection: "column",
      width: "100%",
      height: 2,
      flexShrink: 0,
    });
    this.renderer = renderer;
    this.theme = theme;
    this.status = new TextRenderable(renderer, {
      id: `${id}-status`,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    this.hints = new TextRenderable(renderer, {
      id: `${id}-hints`,
      height: 1,
      flexShrink: 0,
      wrapMode: "none",
      truncate: true,
      content: "",
    });
    this.add(this.status);
    this.add(this.hints);
  }

  update(
    status: string,
    context: CommandContext,
    commands: readonly CommandHint[],
  ): void {
    this.statusText = status;
    this.context = context;
    this.commands = commands;
    this.sync();
  }

  sync(): void {
    this.status.content = t`${fg(this.theme.fgMuted)(this.statusText)}`;
    const width = Math.max(0, this.width || this.renderer.width - 2);
    const required = this.commands.filter((command) =>
      command.contexts.includes(this.context),
    );
    const ordered = [...required].sort((a, b) => {
      const pinned = (command: CommandHint) =>
        command.key === "Tab" || command.key === "Esc"
          ? -100
          : command.priority;
      return pinned(a) - pinned(b);
    });
    const visible: string[] = [];
    let used = 0;
    for (const command of ordered) {
      const text = `${command.key} ${command.action}`;
      const cost = text.length + (visible.length ? 2 : 0);
      if (used + cost > width) continue;
      visible.push(text);
      used += cost;
    }
    this.hints.content = t`${fg(this.theme.fgSubtle)(visible.join("  "))}`;
  }
}
