import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireVaultLock } from "../../src/notes/processLock.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("acquireVaultLock", () => {
  test("serializes separate processes", async () => {
    const root = mkdtempSync(join(tmpdir(), "notes-lock-test-"));
    temporaryDirectories.push(root);
    const release = await acquireVaultLock(root);
    const startedAt = Date.now();
    const child = Bun.spawn(
      [
        "bun",
        "-e",
        `import { acquireVaultLock } from ${JSON.stringify(import.meta.dir + "/../../src/notes/processLock.ts")}; const release = await acquireVaultLock(${JSON.stringify(root)}); release();`,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    await Bun.sleep(150);
    expect(child.exitCode).toBeNull();
    await release();
    expect(await child.exited).toBe(0);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
  });
});
