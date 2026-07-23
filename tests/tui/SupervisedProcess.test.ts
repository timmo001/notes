import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ProcessExitError,
  runSupervisedProcess,
} from "../../src/tui/SupervisedProcess.js";

const ignoredIo = {
  label: "Test process",
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
} as const;

describe("runSupervisedProcess", () => {
  test("resolves for a successful process", async () => {
    await expect(
      runSupervisedProcess(["bash", "-lc", "exit 0"], ignoredIo),
    ).resolves.toBeUndefined();
  });

  test("reports a non-zero exit", async () => {
    try {
      await runSupervisedProcess(["bash", "-lc", "exit 7"], ignoredIo);
      throw new Error("Expected process failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessExitError);
      expect(error).toMatchObject({
        name: "ProcessExitError",
        message: "Test process exited with code 7",
        exitCode: 7,
      });
    }
  });

  test("runs the process in the requested directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "notes-process-"));
    const output = join(directory, "cwd.txt");

    await runSupervisedProcess(["bash", "-lc", 'pwd > "$1"', "bash", output], {
      ...ignoredIo,
      cwd: directory,
    });

    expect((await readFile(output, "utf8")).trim()).toBe(directory);
  });
});
