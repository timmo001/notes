import type { CliRenderer } from "@opentui/core";
import { ENV, envString } from "../lib/env.js";
import { runWithRendererSuspended } from "./SuspendedCommand.js";
import { runSupervisedProcess } from "./SupervisedProcess.js";

/** Supported external editor launch modes. */
export type ExternalEditorKind = "editor" | "visual";

/** Launch a path and wait for the editor to finish. */
export async function openPathInEditor(
  renderer: CliRenderer,
  path: string,
  kind: ExternalEditorKind,
  afterResume?: () => void,
): Promise<void> {
  const command = editorCommand(path, kind);

  if (kind === "visual") {
    await runSupervisedProcess(["bash", "-lc", command], {
      label: "Visual editor",
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    return;
  }

  await runWithRendererSuspended({ renderer, afterResume }, async () => {
    await runSupervisedProcess(["bash", "-lc", command], {
      label: "Editor",
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  });
}

/** Human-readable label for an external editor launch mode. */
export function editorLabel(kind: ExternalEditorKind): string {
  return kind === "visual" ? "visual editor" : "editor";
}

function editorCommand(path: string, kind: ExternalEditorKind): string {
  return `${resolveEditorCommand(kind)} ${shellQuote(path)}`;
}

function resolveEditorCommand(kind: ExternalEditorKind): string {
  return kind === "visual"
    ? firstNonEmpty(envString(ENV.VISUAL), envString(ENV.EDITOR), "nvim")
    : firstNonEmpty(envString(ENV.EDITOR), "nvim");
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string {
  return (
    values.find((value) => value && value.trim().length > 0)?.trim() ?? "nvim"
  );
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
