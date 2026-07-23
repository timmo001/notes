import type { CliRenderer } from "@opentui/core";
import { runWithRendererSuspended } from "./SuspendedCommand.js";
import { runSupervisedProcess } from "./SupervisedProcess.js";

/** Supported OpenCode launch modes. */
export type OpenCodeSessionMode = "default" | "plan";

/** Options for launching an interactive OpenCode session from the TUI. */
export interface OpenCodeSessionOptions {
  /** Directory in which OpenCode should run. */
  readonly cwd?: string;
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
      await runSupervisedProcess(openCodeArgs(options), {
        label: "OpenCode",
        cwd: options.cwd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
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
