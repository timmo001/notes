import { Effect } from "effect";

type HelpRenderer = (commandName?: string) => Effect.Effect<string>;

let renderer: HelpRenderer | undefined;

/** Register the renderer after the application command tree is constructed. */
export function setHelpRenderer(value: HelpRenderer): void {
  renderer = value;
}

/** Render help from the application command tree. */
export function renderHelp(commandName?: string): Effect.Effect<string> {
  return Effect.suspend(() =>
    renderer
      ? renderer(commandName)
      : Effect.die("The notes command tree has not been initialised"),
  );
}
