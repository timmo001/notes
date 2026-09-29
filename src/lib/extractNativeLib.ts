import { Effect, FileSystem, Option, Schema } from "effect";
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
export const extractNativeLibIfNeeded = Effect.fn("notes.extractNativeLib")(
  function* () {
    if (!isCompiledBinary()) return undefined;

    const fs = yield* FileSystem.FileSystem;

    const embeddedLibPath = yield* Effect.tryPromise(
      () => import(`@opentui/core-${process.platform}-${process.arch}`),
    ).pipe(
      Effect.flatMap((nativeModule) =>
        Schema.decodeUnknownEffect(Schema.String)(nativeModule.default),
      ),
      Effect.option,
    );

    if (Option.isNone(embeddedLibPath)) return undefined;

    if (!isBunfsPath(embeddedLibPath.value)) return embeddedLibPath.value;

    const libFileName = basename(embeddedLibPath.value);
    const dir = cacheDir();
    const destPath = join(dir, libFileName);

    if (yield* fs.exists(destPath)) return destPath;

    // Stale cache files are non-fatal.
    yield* Effect.gen(function* () {
      if (!(yield* fs.exists(dir))) return;

      for (const file of yield* fs.readDirectory(dir)) {
        if (
          file.startsWith("libopentui") &&
          file.endsWith(".so") &&
          file !== libFileName
        ) {
          yield* fs.remove(join(dir, file));
        }
      }
    }).pipe(Effect.ignore);

    yield* fs.makeDirectory(dir, { recursive: true });
    const tmpPath = `${destPath}.tmp-${process.pid}-${Date.now()}`;

    yield* Effect.gen(function* () {
      yield* fs.writeFile(tmpPath, yield* fs.readFile(embeddedLibPath.value), {
        mode: 0o755,
      });
      yield* fs.rename(tmpPath, destPath);
    }).pipe(
      Effect.tapError(() =>
        // Best-effort cleanup.
        Effect.ignore(fs.remove(tmpPath, { force: true })),
      ),
    );

    return destPath;
  },
);
