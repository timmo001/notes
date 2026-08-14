export const NOTES_NAVIGATION_MIN = 30;
export const NOTES_PREVIEW_MIN = 40;
export const NOTES_SHELL_PADDING = 2;
export const NOTES_DIVIDER_WIDTH = 1;
export const NOTES_CONTENT_MIN = 30;
export const NOTES_REQUIRED_HEIGHT = 12;

export type NotesLayout =
  | {
      readonly mode: "split";
      readonly navigationWidth: number;
      readonly previewWidth: number;
    }
  | { readonly mode: "master-detail" }
  | {
      readonly mode: "minimum";
      readonly requiredWidth: number;
      readonly requiredHeight: number;
    };

/** Measure the Notes workspace from pane and shell requirements. */
export function measureNotesLayout(width: number, height: number): NotesLayout {
  const requiredWidth = NOTES_CONTENT_MIN + NOTES_SHELL_PADDING;
  if (width < requiredWidth || height < NOTES_REQUIRED_HEIGHT) {
    return {
      mode: "minimum",
      requiredWidth,
      requiredHeight: NOTES_REQUIRED_HEIGHT,
    };
  }
  const available = width - NOTES_SHELL_PADDING - NOTES_DIVIDER_WIDTH;
  if (available < NOTES_NAVIGATION_MIN + NOTES_PREVIEW_MIN) {
    return { mode: "master-detail" };
  }
  const navigationWidth = Math.max(
    NOTES_NAVIGATION_MIN,
    Math.floor(available * 0.35),
  );
  return {
    mode: "split",
    navigationWidth,
    previewWidth: available - navigationWidth,
  };
}
