import type { Share } from "@timmo001/groundwork-pwa";

/**
 * The text a share puts in the note: its title, text and link, one to a line.
 * Android apps often put the link in the text too, so a line that another
 * already holds isn't added again.
 */
export function shareNote({ title, text, url }: Share): string {
  const lines = [title, text, url].flatMap((line) =>
    line === undefined || line.trim() === "" ? [] : [line.trim()],
  );

  return lines
    .filter(
      (line, at) =>
        !lines.some(
          (other, otherAt) =>
            other.includes(line) && (other !== line || otherAt < at),
        ),
    )
    .join("\n");
}
