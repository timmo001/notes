import { t, bold, fg } from "@opentui/core";
import type { StyledText } from "@opentui/core";
import type { Theme } from "../theme.js";

const SEPARATOR = " > ";

/** Format a breadcrumb trail for subview title bars. */
export function formatBreadcrumb(
  theme: Theme,
  parts: readonly string[],
  subtitle?: string,
): StyledText {
  const sub = subtitle ? fg(theme.fgMuted)(` - ${subtitle}`) : "";

  if (parts.length <= 1) {
    return t`${bold(fg(theme.accent)(parts[0] ?? ""))}${sub}`;
  }

  if (parts.length === 2) {
    return t`${fg(theme.fgMuted)(parts[0])}${fg(theme.fgSubtle)(SEPARATOR)}${bold(fg(theme.accent)(parts[1]))}${sub}`;
  }

  const prefix = parts.slice(0, -1).join(SEPARATOR);
  const last = parts[parts.length - 1];
  return t`${fg(theme.fgMuted)(prefix)}${fg(theme.fgSubtle)(SEPARATOR)}${bold(fg(theme.accent)(last))}${sub}`;
}
