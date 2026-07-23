export class ProcessExitError extends Error {
  readonly exitCode: number;

  constructor(label: string, exitCode: number) {
    super(`${label} exited with code ${exitCode}`);
    this.name = "ProcessExitError";
    this.exitCode = exitCode;
  }
}

/** Run a child process and reject when it exits non-zero. */
export async function runSupervisedProcess(
  command: readonly string[],
  options: {
    readonly label: string;
    readonly cwd?: string;
    readonly stdin: "inherit" | "ignore";
    readonly stdout: "inherit" | "ignore";
    readonly stderr: "inherit" | "ignore";
  },
): Promise<void> {
  const proc = Bun.spawn([...command], {
    cwd: options.cwd,
    stdin: options.stdin,
    stdout: options.stdout,
    stderr: options.stderr,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new ProcessExitError(options.label, exitCode);
}
