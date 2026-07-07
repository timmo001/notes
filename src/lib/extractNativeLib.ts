import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { envString, ENV } from "./env.js";
import { HOME_DIR } from "./paths.js";

const BUNFS_ROOT = "/$bunfs/root";

function isCompiledBinary(): boolean {
  return (
    import.meta.path.includes("$bunfs") ||
    import.meta.path.startsWith(BUNFS_ROOT)
  );
}

function isBunfsPath(path: string): boolean {
  return path.includes("$bunfs") || path.startsWith(BUNFS_ROOT);
}

function cacheDir(): string {
  return join(
    envString(ENV.XDG_CACHE_HOME) ?? join(HOME_DIR, ".cache"),
    "notes",
    "native-lib",
  );
}

/** Extract the OpenTUI native library from Bun's virtual filesystem when compiled. */
export async function extractNativeLibIfNeeded(): Promise<string | undefined> {
  if (!isCompiledBinary()) return undefined;

  let embeddedLibPath: string;
  try {
    const nativeModule = await import(
      `@opentui/core-${process.platform}-${process.arch}`
    );
    embeddedLibPath = nativeModule.default as string;
  } catch {
    return undefined;
  }

  if (!isBunfsPath(embeddedLibPath)) return embeddedLibPath;

  const libFileName = basename(embeddedLibPath);
  const dir = cacheDir();
  const destPath = join(dir, libFileName);

  if (existsSync(destPath)) return destPath;

  try {
    if (existsSync(dir)) {
      for (const file of readdirSync(dir)) {
        if (
          file.startsWith("libopentui") &&
          file.endsWith(".so") &&
          file !== libFileName
        ) {
          unlinkSync(join(dir, file));
        }
      }
    }
  } catch {
    // Stale cache files are non-fatal.
  }

  mkdirSync(dir, { recursive: true });
  const tmpPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmpPath, readFileSync(embeddedLibPath), { mode: 0o755 });
    renameSync(tmpPath, destPath);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup.
    }
    throw error;
  }

  return destPath;
}
