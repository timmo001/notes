/** Environment variables used by notes. */
export const ENV = {
  HOME: "HOME",
  USER: "USER",
  NOTES: "NOTES",
  DOT_NOTES_DIR: "DOT_NOTES_DIR",
  EDITOR: "EDITOR",
  VISUAL: "VISUAL",
  XDG_CACHE_HOME: "XDG_CACHE_HOME",
  XDG_CONFIG_HOME: "XDG_CONFIG_HOME",
  XDG_STATE_HOME: "XDG_STATE_HOME",
  NO_COLOR: "NO_COLOR",
} as const;

/** Read an environment variable as a string. */
export function envString(name: string): string | undefined {
  return process.env[name];
}

/** Read a non-negative integer from the environment, falling back on invalid input. */
export function envNonNegativeInt(name: string, fallback: number): number {
  const value = envString(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
