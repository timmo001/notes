import { describe, expect, test } from "bun:test";
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
      expect((error as ProcessExitError).exitCode).toBe(7);
    }
  });
});
