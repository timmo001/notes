import {
  StyledText,
  TextRenderable,
  fg,
  type BoxRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { TextChunk } from "@opentui/core";
import type { Theme } from "../theme.js";

/** A key-action pair displayed in a help bar. */
export interface HelpEntry {
  /** Key or key combination. */
  readonly key: string;
  /** Action description. */
  readonly action: string;
}

/** Options for creating a resize-aware help bar renderable. */
export interface ResponsiveHelpBarOptions {
  /** Unique renderable ID. */
  readonly id: string;
  /** Active colour theme. */
  readonly theme: Theme;
  /** Help entries to display. */
  readonly entries: readonly HelpEntry[];
  /** Top margin passed to the help bar renderable. */
  readonly marginTop?: number;
}

/** Global help entries appended to every view's help bar. */
export const GLOBAL_HELP: readonly HelpEntry[] = [
  { key: "Ctrl+c", action: "quit" },
];

const SEPARATOR = "   ";
const HELP_BAR_HORIZONTAL_MARGIN = 4;

function visibleWidth(value: string): number {
  return Array.from(value).length;
}

/** Format help bar entries into styled text with automatic row wrapping. */
export function formatHelpBar(
  theme: Theme,
  entries: readonly HelpEntry[],
  suffix?: TextChunk,
  maxColumns = process.stdout.columns || 80,
): StyledText {
  const plainParts = entries.map((entry) => `${entry.key} ${entry.action}`);
  const columns = Math.max(20, maxColumns - HELP_BAR_HORIZONTAL_MARGIN);
  const rows: number[][] = [];
  let currentWidth = 0;
  let currentRow: number[] = [];

  for (let index = 0; index < plainParts.length; index++) {
    const partWidth = visibleWidth(plainParts[index]);
    const candidateWidth =
      currentRow.length > 0
        ? currentWidth + visibleWidth(SEPARATOR) + partWidth
        : partWidth;
    if (currentRow.length > 0 && candidateWidth > columns) {
      rows.push(currentRow);
      currentRow = [index];
      currentWidth = partWidth;
    } else {
      currentRow.push(index);
      currentWidth = candidateWidth;
    }
  }

  if (currentRow.length > 0) rows.push(currentRow);

  const chunks: TextChunk[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    if (rowIndex > 0) chunks.push(fg(theme.fgSubtle)("\n"));
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
      if (columnIndex > 0) chunks.push(fg(theme.fgSubtle)(SEPARATOR));
      const entry = entries[row[columnIndex]];
      chunks.push(fg(theme.fgMuted)(entry.key));
      chunks.push(fg(theme.fgSubtle)(` ${entry.action}`));
    }
  }

  if (suffix) {
    chunks.push(fg(theme.fgSubtle)("  "));
    chunks.push(suffix);
  }

  return new StyledText(chunks);
}

/** Add a help bar to a view and keep its wrapped content current on resize. */
export function addResponsiveHelpBar(
  renderer: CliRenderer,
  root: BoxRenderable,
  options: ResponsiveHelpBarOptions,
): TextRenderable {
  const helpBar = new TextRenderable(renderer, {
    id: options.id,
    content: formatHelpBar(
      options.theme,
      options.entries,
      undefined,
      renderer.terminalWidth,
    ),
    width: "100%",
    ...(options.marginTop === undefined
      ? {}
      : { marginTop: options.marginTop }),
  });
  root.add(helpBar);
  renderer.on("resize", () => {
    helpBar.content = formatHelpBar(
      options.theme,
      options.entries,
      undefined,
      renderer.terminalWidth,
    );
  });
  return helpBar;
}
