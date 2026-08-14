import type { Theme } from "../../theme.js";

/** Resolve ordinary app surfaces without covering a transparent terminal. */
export function surfaceBackground(theme: Theme): string {
  return theme.transparent ? "transparent" : theme.bgElevated;
}

/** Shared visual tokens used by the Notes TUI recipes. */
export function componentStyles(theme: Theme) {
  return {
    surface: { backgroundColor: surfaceBackground(theme) },
    divider: theme.fgSubtle,
    focus: theme.accent,
    muted: theme.fgMuted,
    success: theme.green,
    warning: theme.yellow,
    destructive: theme.red,
  } as const;
}
