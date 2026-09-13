import { TextRenderable, bold, fg, t, type CliRenderer } from "@opentui/core";
import { ButtonRenderable } from "@tuiparts/core/button";
import { Match } from "effect";
import type { Theme } from "../../theme.js";

export type ButtonVariant = "neutral" | "primary" | "destructive";

export interface ButtonOptions {
  readonly id: string;
  readonly theme: Theme;
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly onPress: () => void;
}

/** TUI Parts button with Notes-owned presentation. */
export class Button extends ButtonRenderable {
  constructor(renderer: CliRenderer, options: ButtonOptions) {
    const color = Match.value(options.variant).pipe(
      Match.when("destructive", () => options.theme.red),
      Match.when("primary", () => options.theme.accent),
      Match.orElse(() => options.theme.fgMuted),
    );

    super(renderer, {
      id: options.id,
      height: 1,
      flexShrink: 0,
      paddingLeft: 1,
      paddingRight: 1,
      onPress: options.onPress,
      backgroundColor: options.theme.bgSelected,
    });
    this.add(
      new TextRenderable(renderer, {
        content: t`${bold(fg(color)(options.label))}`,
        height: 1,
        wrapMode: "none",
      }),
    );
  }
}
