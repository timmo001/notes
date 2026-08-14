import type { CliRenderer } from "@opentui/core";
import { InputRenderable, type InputOptions } from "@tuiparts/core/input";
import type { Theme } from "../../theme.js";

export interface ThemedInputOptions extends InputOptions {
  readonly id: string;
  readonly theme: Theme;
}

/** TUI Parts input using the active Notes theme. */
export class Input extends InputRenderable {
  constructor(
    renderer: CliRenderer,
    { theme, ...options }: ThemedInputOptions,
  ) {
    super(renderer, {
      width: "100%",
      backgroundColor: theme.bgInput,
      focusedBackgroundColor: theme.bgSelected,
      textColor: theme.fg,
      cursorColor: theme.accent,
      ...options,
    });
  }
}
