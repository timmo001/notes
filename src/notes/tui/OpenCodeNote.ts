import type { CliRenderer } from "@opentui/core";
import type { NoteEntry } from "../types.js";
import {
  openOpenCodeSession,
  type OpenCodeSessionMode,
} from "../../tui/openCodeSession.js";

/** Supported OpenCode launch modes for repository notes. */
export type OpenCodeNoteMode = OpenCodeSessionMode;

/** Options for launching OpenCode from the notes TUI. */
export interface OpenNoteInOpenCodeOptions {
  /** Which OpenCode agent mode to use. */
  readonly mode?: OpenCodeNoteMode;
  /** Optional plan command loader, primarily for deterministic tests. */
  readonly loadPlanCommand?: () => Promise<string | null>;
  /** Callback to run after the TUI resumes. */
  readonly afterResume?: () => void;
}

const DEFAULT_PLAN_INSTRUCTIONS = `Create an implementation-ready plan for the loaded note below. Inspect the relevant implementation and tests before planning, resolve repository facts with read-only tools, and include concrete locations, change mechanics, verification, and a Files tree. Split out deferred stages only when they are independently reviewable. If the loaded note is a handoff or temporary plan, make its deletion the final implementation step after all tracked work and validation are complete, requiring explicit user confirmation before deletion. Do not delete it while work remains deferred, blocked, or unresolved. Make no implementation changes while planning.`;

/** Suspend the TUI, launch a full OpenCode session for a note, then resume. */
export async function openNoteInOpenCode(
  renderer: CliRenderer,
  entry: NoteEntry,
  noteContent: string,
  options: OpenNoteInOpenCodeOptions = {},
): Promise<void> {
  const mode = options.mode ?? "default";
  const planCommand =
    mode === "plan"
      ? await (options.loadPlanCommand ?? loadConfiguredPlanCommand)()
      : null;
  await openOpenCodeSession(renderer, {
    mode,
    prompt: opencodeNotePrompt(entry, noteContent, mode, planCommand),
    afterResume: options.afterResume,
  });
}

/** Build the startup prompt that loads a complete note into OpenCode. */
export function opencodeNotePrompt(
  entry: NoteEntry,
  noteContent: string,
  mode: OpenCodeNoteMode,
  planCommand: string | null = null,
): string {
  const displayPath = projectsDisplayPath(entry);
  const notePrompt = [
    `Use the repository note ${entry.filename} included below as loaded context for this OpenCode session, following the note-reference next-step flow.`,
    `The note file path is ${entry.filePath}.`,
    ...(mode === "plan"
      ? [
          "",
          "This OpenCode process was launched with --agent plan. You are already running inside the plan agent.",
          "After loading the note and relevant skills, present an execution-ready plan directly. Do not suggest entering /plan and do not stop at a single next action.",
          "If the note does not contain enough detail for a safe plan, automatically gather the missing repository context with read-only tools first, then present the plan. If the plan is still blocked after gathering context, state exactly what remains missing.",
        ]
      : []),
    "",
    "Step 1: Keep the full loaded note content below in context for this session. Do not call notes_note_read just to load this note; the notes TUI already supplied it.",
    "Keep the full note content in context for this session.",
    "",
    `----- BEGIN LOADED NOTE: ${displayPath} -----`,
    noteContent.length > 0 ? noteContent : "(empty note)",
    `----- END LOADED NOTE: ${displayPath} -----`,
    "",
    "Step 2: Inspect the loaded note content for explicit skill names or clearly required skill workflows. Load each relevant skill with the skill tool before presenting next steps.",
    "Prefer skills explicitly listed in note sections such as Skills, Applicable Skills, Required Skills, Workflow, or Next Steps.",
    "Do not invent skill names. If no relevant skill is explicit or clearly triggered, skip skill loading silently.",
    "",
    ...(mode === "plan"
      ? [
          "Step 3: Treat this as planning context. Present a complete implementation plan for resuming from the loaded note.",
          "Do not make changes unless the user explicitly asks to implement, fix, edit, run, or otherwise make a change.",
        ]
      : [
          "Step 3: Treat this as read-only context loading unless the user's follow-up explicitly asks to implement, fix, edit, run, or otherwise make a change.",
          "Present the immediate next step only.",
        ]),
    "",
    "Confirm exactly:",
    `Loaded: ${displayPath}`,
    "",
    "The content is now in context. Answer follow-up questions about it directly, but do not make changes unless the user explicitly asks for them.",
  ].join("\n");

  if (mode !== "plan") return notePrompt;

  const instructions = planCommand?.trim() || DEFAULT_PLAN_INSTRUCTIONS;
  return instructions.includes("${ARGUMENTS}")
    ? instructions.replaceAll("${ARGUMENTS}", notePrompt)
    : `${instructions}\n\n${notePrompt}`;
}

/** Read the configured `/plan` command template from OpenCode when available. */
export async function loadConfiguredPlanCommand(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["opencode", "debug", "config"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, , exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) return null;
    return planCommandTemplate(JSON.parse(stdout) as unknown);
  } catch {
    return null;
  }
}

/** Extract the plan command template from an unknown resolved config payload. */
export function planCommandTemplate(config: unknown): string | null {
  if (!isRecord(config) || !isRecord(config.command)) return null;
  const plan = config.command.plan;
  return isRecord(plan) && typeof plan.template === "string"
    ? plan.template
    : null;
}

function projectsDisplayPath(entry: NoteEntry): string {
  const marker = "/projects/";
  const normalized = entry.filePath.replaceAll("\\", "/");
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) return entry.filename;
  return `projects/${normalized.slice(markerIndex + marker.length)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
