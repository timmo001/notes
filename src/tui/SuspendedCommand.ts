import type { CliRenderer } from "@opentui/core";

/** Options for running arbitrary async work while OpenTUI is suspended. */
export interface RendererSuspensionOptions {
  /** Active OpenTUI renderer to suspend and resume. */
  readonly renderer: CliRenderer;
  /** Called after the renderer resumes. */
  readonly afterResume?: () => void;
}

/** Suspend the TUI, run async work, then restore rendering. */
export async function runWithRendererSuspended<T>(
  options: RendererSuspensionOptions,
  work: () => Promise<T>,
): Promise<T> {
  const { renderer, afterResume } = options;
  renderer.suspend();
  renderer.currentRenderBuffer.clear();

  try {
    return await work();
  } finally {
    renderer.currentRenderBuffer.clear();
    renderer.resume();
    afterResume?.();
    renderer.requestRender();
  }
}
