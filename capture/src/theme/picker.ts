/**
 * Connects the header's gw-theme-picker to the page's theme: Groundwork's core
 * themes, Base by default, or one the user imports, in auto, light, dark or
 * Darker. `pageTheme` also registers the WebMCP theme tools.
 */
import type { GwThemePicker } from "@timmo001/groundwork-ui/gw-theme-picker.ts";
import { on } from "@timmo001/groundwork-ui/on.ts";
import {
  coreThemeChoices,
  pageTheme,
  type ThemeMode,
} from "@timmo001/groundwork-tokens/page";
import { themeOptions } from "./options.js";

const page = pageTheme({ ...themeOptions, themes: coreThemeChoices });

const modes: readonly ThemeMode[] = ["auto", "light", "dark", "darker"];

const choices = (custom: string | null) => [
  ...coreThemeChoices.map(({ id, name }) => ({ value: id, label: name })),
  ...(custom === null ? [] : [{ value: "custom", label: custom }]),
];

/** Keeps `picker` in step with the page's theme and applies what it picks. */
export const bindThemePicker = (picker: GwThemePicker) => {
  const sync = () => {
    const state = page.state();
    picker.mode = state.mode;
    picker.theme = state.theme;
    picker.themes = choices(state.custom);
  };

  sync();

  const stops = [
    page.subscribe(sync),
    on(picker, "mode", (event) => {
      const mode = modes.find((known) => known === event.detail.mode);

      if (mode !== undefined) {
        page.setMode(mode);
      }
    }),
    on(picker, "theme", (event) => page.setTheme(event.detail.id)),
    on(picker, "import", (event) => {
      void page.importTheme(event.detail.text).then((result) => {
        picker.status = result.ok
          ? result.misses.length === 0
            ? `Using ${result.name}`
            : `Using ${result.name}. Some colours miss their contrast target: ${result.misses.join(", ")}`
          : result.error;
      });
    }),
    on(picker, "reset", () => {
      page.reset();
      picker.status = "";
    }),
  ];

  return () => {
    for (const stop of stops) stop();
  };
};
