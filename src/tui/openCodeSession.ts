import type { CliRenderer } from "@opentui/core";
import { runWithRendererSuspended } from "./SuspendedCommand.js";

/** Supported OpenCode launch modes. */
export type OpenCodeSessionMode = "default" | "plan";

/** Options for launching an interactive OpenCode session from the TUI. */
export interface OpenCodeSessionOptions {
  /** Which OpenCode agent mode to use. */
  readonly mode?: OpenCodeSessionMode;
  /** Optional prompt to pass to OpenCode. */
  readonly prompt?: string;
  /** Callback to run after the TUI resumes. */
  readonly afterResume?: () => void;
}

/** Suspend the TUI, launch an interactive OpenCode session, then resume. */
export async function openOpenCodeSession(
  renderer: CliRenderer,
  options: OpenCodeSessionOptions = {},
): Promise<void> {
  await runWithRendererSuspended(
    { renderer, afterResume: options.afterResume },
    async () => {
      const proc = Bun.spawn(openCodeArgs(options), {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
    },
  );
}

/** Human-readable label for an OpenCode session mode. */
export function openCodeSessionLabel(mode: OpenCodeSessionMode): string {
  return mode === "plan" ? "OpenCode plan" : "OpenCode";
}

function openCodeArgs(options: OpenCodeSessionOptions): string[] {
  const args =
    options.mode === "plan" ? ["opencode", "--agent", "plan"] : ["opencode"];
  if (options.prompt !== undefined) args.push("--prompt", options.prompt);
  return args;
}
