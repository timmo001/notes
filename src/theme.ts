import { Effect, Schema } from "effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENV, envString } from "./lib/env.js";
import { HOME_DIR } from "./lib/paths.js";

/** Semantic colour tokens for the notes TUI. */
export interface Theme {
  /** App background. */
  readonly bg: string;
  /** Elevated surface background. */
  readonly bgElevated: string;
  /** Selected row background. */
  readonly bgSelected: string;
  /** Focused input background. */
  readonly bgInput: string;
  /** Accent colour for selections and emphasis. */
  readonly accent: string;
  /** Text colour for accent backgrounds. */
  readonly accentFg: string;
  /** Secondary surface colour. */
  readonly surface: string;
  /** Primary foreground text. */
  readonly fg: string;
  /** Muted secondary text. */
  readonly fgMuted: string;
  /** Subtle text and separators. */
  readonly fgSubtle: string;
  /** Ghost text. */
  readonly fgGhost: string;
  /** Success state. */
  readonly green: string;
  /** Error state. */
  readonly red: string;
  /** Warning state. */
  readonly yellow: string;
  /** Whether backgrounds should allow terminal transparency. */
  readonly transparent: boolean;
}

const FALLBACK: Theme = {
  bg: "#06060a",
  bgElevated: "#0e0e15",
  bgSelected: "#1a1a2e",
  bgInput: "#181825",
  accent: "#89b4fa",
  accentFg: "#11111b",
  surface: "#313244",
  fg: "#cdd6f4",
  fgMuted: "#a6adc8",
  fgSubtle: "#6c7086",
  fgGhost: "#45475a",
  green: "#a6e3a1",
  red: "#f38ba8",
  yellow: "#f9e2af",
  transparent: false,
};

const COLORS_TOML_PATH = join(
  envString(ENV.XDG_CONFIG_HOME) ?? join(HOME_DIR, ".config"),
  "omarchy",
  "current",
  "theme",
  "colors.toml",
);

type RGB = [r: number, g: number, b: number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pickAccentFg(
  accent: string,
  fgColor: string,
  bgColor: string,
): string {
  const al = luminance(accent);
  const fl = luminance(fgColor);
  const bl = luminance(bgColor);
  const fgRatio = (Math.max(al, fl) + 0.05) / (Math.min(al, fl) + 0.05);
  const bgRatio = (Math.max(al, bl) + 0.05) / (Math.min(al, bl) + 0.05);
  return fgRatio >= bgRatio ? fgColor : bgColor;
}

function parseColorsToml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("["))
      continue;
    const match = trimmed.match(/^(\w+)\s*=\s*"([^"]+)"/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function deriveTheme(c: Record<string, string>): Theme {
  const bg = c.background ?? FALLBACK.bg;
  const fgColor = c.foreground ?? FALLBACK.fg;
  const accent = c.accent ?? FALLBACK.accent;
  return {
    bg,
    bgElevated: mix(bg, fgColor, 0.05),
    bgSelected: mix(bg, accent, 0.2),
    bgInput: mix(bg, fgColor, 0.08),
    accent,
    accentFg: mix(accent, pickAccentFg(accent, fgColor, bg), 0.8),
    surface: mix(bg, fgColor, 0.19),
    fg: fgColor,
    fgMuted: mix(bg, fgColor, 0.67),
    fgSubtle: mix(bg, fgColor, 0.3),
    fgGhost: mix(bg, fgColor, 0.4),
    green: c.color2 ?? FALLBACK.green,
    red: c.color1 ?? FALLBACK.red,
    yellow: c.color3 ?? FALLBACK.yellow,
    transparent: true,
  };
}

class ThemeLoadError extends Schema.TaggedErrorClass<ThemeLoadError>()(
  "ThemeLoadError",
  { message: Schema.String },
) {}

/** Load the active Omarchy theme, falling back to a dark palette. */
export const loadTheme: Effect.Effect<Theme> = Effect.gen(function* () {
  const raw = yield* Effect.try({
    try: () => readFileSync(COLORS_TOML_PATH, "utf-8"),
    catch: (error) => new ThemeLoadError({ message: String(error) }),
  });
  return deriveTheme(parseColorsToml(raw));
}).pipe(Effect.orElseSucceed(() => FALLBACK));
