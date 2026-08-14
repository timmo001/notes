import { TextRenderable, fg, t, type CliRenderer } from "@opentui/core";
import {
  CollapsiblePanelRenderable,
  CollapsibleRootRenderable,
  CollapsibleTriggerRenderable,
} from "@tuiparts/core/collapsible";
import type { Theme } from "../../theme.js";

export interface CollapsibleOptions {
  readonly id: string;
  readonly theme: Theme;
  readonly label: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Controlled TUI Parts collapsible with a stable one-row trigger. */
export class Collapsible extends CollapsibleRootRenderable {
  readonly trigger: CollapsibleTriggerRenderable;
  readonly panel: CollapsiblePanelRenderable;
  private readonly label: TextRenderable;
  private readonly labelText: string;
  private readonly theme: Theme;

  constructor(renderer: CliRenderer, options: CollapsibleOptions) {
    super(renderer, {
      id: options.id,
      open: options.open,
      flexDirection: "column",
      width: "100%",
      flexShrink: 0,
      onOpenChange: (open) => {
        this.open = open;
        this.syncLabel(open);
        options.onOpenChange(open);
      },
    });
    this.labelText = options.label;
    this.theme = options.theme;
    this.trigger = new CollapsibleTriggerRenderable(renderer, {
      id: `${options.id}-trigger`,
      store: this.store,
      height: 1,
      flexShrink: 0,
    });
    this.label = new TextRenderable(renderer, {
      id: `${options.id}-label`,
      content: "",
      height: 1,
      wrapMode: "none",
      truncate: true,
    });
    this.trigger.add(this.label);
    this.panel = new CollapsiblePanelRenderable(renderer, {
      id: `${options.id}-panel`,
      store: this.store,
      flexDirection: "column",
      width: "100%",
      flexShrink: 0,
    });
    this.add(this.trigger);
    this.add(this.panel);
    this.syncLabel(options.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.syncLabel(open);
  }

  private syncLabel(open: boolean): void {
    this.label.content = t`${fg(this.theme.fgMuted)(`${open ? "▾" : "▸"} ${this.labelText}`)}`;
  }
}
