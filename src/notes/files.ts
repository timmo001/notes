import { createHash, randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { Effect, FileSystem, Match, Option, Predicate, Schema } from "effect";
import type { PlatformError } from "effect";
import { isSafeRepositorySegment } from "../git/remotes.js";
import { expandHomePath } from "../lib/paths.js";

/** Domain error for note path validation and file I/O failures. */
export class NoteFileError extends Schema.TaggedError<NoteFileError>()(
  "NoteFileError",
  { message: Schema.String },
) {}

/** What a path currently is, without following a leaf symlink. */
export type PathKind = "missing" | "symlink" | "directory" | "file" | "other";

export interface ReadNoteFileResult {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
  readonly mtime: number;
}

interface NotePathParts {
  readonly path: string;
  readonly owner: string;
  readonly repo: string;
  readonly filename: string;
}

const READ_CHUNK_BYTES = 64 * 1024;

const failWith = (message: string) => new NoteFileError({ message });

function isNotFound(error: PlatformError.PlatformError): boolean {
  return Predicate.isTagged(error.reason, "NotFound");
}

function isAlreadyExists(error: PlatformError.PlatformError): boolean {
  return Predicate.isTagged(error.reason, "AlreadyExists");
}

function isInsideDirectory(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== "..")
  );
}

function notePathParts(
  projectsRoot: string,
  input: string,
): Effect.Effect<NotePathParts, NoteFileError> {
  const expanded = expandHomePath(input);

  if (!isAbsolute(expanded))
    return Effect.fail(failWith(`Note path must be absolute: ${input}`));

  const root = resolve(projectsRoot);
  const path = resolve(expanded);
  const relativePath = relative(root, path);

  if (!isInsideDirectory(root, path)) {
    return Effect.fail(
      failWith(`Path is outside the repository notes directory: ${input}`),
    );
  }

  const parts = relativePath.split(sep);

  if (parts.length !== 3) {
    return Effect.fail(
      failWith(
        `Note path must match projects/<owner>/<repo>/<note>.md: ${input}`,
      ),
    );
  }

  const [owner, repo, filename] = parts;

  if (
    !owner ||
    !repo ||
    !filename ||
    !isSafeRepositorySegment(owner) ||
    !isSafeRepositorySegment(repo) ||
    basename(filename) !== filename ||
    !filename.endsWith(".md") ||
    filename === ".md"
  ) {
    return Effect.fail(failWith(`Invalid repository note path: ${input}`));
  }

  return Effect.succeed({ path, owner, repo, filename });
}

/** Classify a path without following a leaf symlink. */
export const inspectPath = Effect.fn("notes.files.inspectPath")(function* (
  path: string,
) {
  const fs = yield* FileSystem.FileSystem;

  const isSymlink = yield* fs.readLink(path).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

  if (isSymlink) return { kind: "symlink" as const };

  const info = yield* fs.stat(path).pipe(
    Effect.asSome,
    Effect.catchIf(isNotFound, () => Effect.succeedNone),
  );

  if (Option.isNone(info)) return { kind: "missing" as const };

  const kind = Match.value(info.value.type).pipe(
    Match.when("Directory", (): PathKind => "directory"),
    Match.when("File", (): PathKind => "file"),
    Match.orElse((): PathKind => "other"),
  );

  return { kind, info: info.value };
});

const assertDirectory = Effect.fn("notes.files.assertDirectory")(function* (
  path: string,
) {
  const { kind } = yield* inspectPath(path);

  if (kind !== "directory") {
    return yield* failWith(
      `Note directory is not a physical directory: ${path}`,
    );
  }
});

/** Create the vault root when needed and reject a symlinked root. */
export const ensurePhysicalVaultRoot = Effect.fn(
  "notes.files.ensurePhysicalVaultRoot",
)(function* (notesRoot: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = resolve(notesRoot);

  if ((yield* inspectPath(path)).kind === "missing")
    yield* fs.makeDirectory(path, { recursive: true });
  yield* assertDirectory(path);

  return path;
});

const ensurePhysicalParents = Effect.fn("notes.files.ensurePhysicalParents")(
  function* (
    projectsRoot: string,
    owner: string,
    repo: string,
    create: boolean,
  ) {
    const fs = yield* FileSystem.FileSystem;
    const root = resolve(projectsRoot);
    const notesRoot = dirname(root);
    yield* assertDirectory(notesRoot);

    for (const path of [root, join(root, owner), join(root, owner, repo)]) {
      if ((yield* inspectPath(path)).kind === "missing") {
        if (!create)
          return yield* failWith(`Note directory does not exist: ${path}`);
        yield* fs.makeDirectory(path);
      }

      yield* assertDirectory(path);
    }

    const physicalRoot = yield* fs.realPath(root);
    const parent = join(root, owner, repo);
    const physicalParent = yield* fs.realPath(parent);

    if (!isInsideDirectory(physicalRoot, physicalParent)) {
      return yield* failWith(
        `Note directory resolves outside projects: ${parent}`,
      );
    }

    return parent;
  },
);

const assertRegularTarget = Effect.fn("notes.files.assertRegularTarget")(
  function* (path: string, allowMissing: boolean) {
    const { kind } = yield* inspectPath(path);

    if (kind === "missing") {
      if (allowMissing) return;

      return yield* failWith(`Note file does not exist: ${path}`);
    }

    if (kind !== "file") {
      return yield* failWith(
        `Note path is not a physical regular file: ${path}`,
      );
    }
  },
);

/** Resolve and validate one physical repository notes directory. */
export const resolveRepositoryNotesDirectory = Effect.fn(
  "notes.files.resolveRepositoryNotesDirectory",
)(function* (projectsRoot: string, input: string) {
  const root = resolve(projectsRoot);
  const path = resolve(input);
  const parts = relative(root, path).split(sep);
  const [owner, repo] = parts;

  if (
    !isInsideDirectory(root, path) ||
    parts.length !== 2 ||
    !owner ||
    !repo ||
    !isSafeRepositorySegment(owner) ||
    !isSafeRepositorySegment(repo)
  ) {
    return yield* failWith(`Invalid repository notes directory: ${input}`);
  }

  return yield* ensurePhysicalParents(root, owner, repo, false);
});

const prepareNotePath = Effect.fn("notes.files.prepareNotePath")(function* (
  projectsRoot: string,
  input: string,
  options: { readonly createParents: boolean; readonly allowMissing: boolean },
) {
  const parts = yield* notePathParts(projectsRoot, input);

  yield* ensurePhysicalParents(
    projectsRoot,
    parts.owner,
    parts.repo,
    options.createParents,
  );
  yield* assertRegularTarget(parts.path, options.allowMissing);

  return parts.path;
});

/** Resolve a valid note path whether or not its leaf currently exists. */
export const resolveOptionalNotePath = (projectsRoot: string, input: string) =>
  prepareNotePath(projectsRoot, input, {
    createParents: false,
    allowMissing: true,
  });

export function hashNoteContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Resolve and validate a note path for an existing physical file. */
export const resolveExistingNotePath = (projectsRoot: string, input: string) =>
  prepareNotePath(projectsRoot, input, {
    createParents: false,
    allowMissing: false,
  });

/** Resolve and validate a note path that may be created. */
export const resolveWritableNotePath = (projectsRoot: string, input: string) =>
  prepareNotePath(projectsRoot, input, {
    createParents: true,
    allowMissing: true,
  });

const readAll = Effect.fn("notes.files.readAll")(function* (
  file: FileSystem.File,
) {
  const chunks: Uint8Array[] = [];

  for (;;) {
    const chunk = yield* file.readAlloc(READ_CHUNK_BYTES);

    if (Option.isNone(chunk)) break;
    chunks.push(chunk.value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
});

/**
 * Read a regular note, rejecting a leaf that was swapped for another file
 * between validation and open.
 */
export const readNoteFile = Effect.fn("notes.files.readNoteFile")(function* (
  projectsRoot: string,
  input: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* resolveExistingNotePath(projectsRoot, input);
  const before = yield* fs.stat(path);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const file = yield* fs.open(path, { flag: "r" });
      const stat = yield* file.stat;

      if (
        stat.type !== "File" ||
        stat.dev !== before.dev ||
        Option.getOrUndefined(stat.ino) !== Option.getOrUndefined(before.ino)
      ) {
        return yield* failWith(`Note path is not a regular file: ${path}`);
      }

      const content = yield* readAll(file);

      return {
        path,
        content,
        hash: hashNoteContent(content),
        mtime: Option.match(stat.mtime, {
          onNone: () => 0,
          onSome: (mtime) => mtime.getTime() / 1000,
        }),
      } satisfies ReadNoteFileResult;
    }),
  );
});

const writeTemporaryFile = Effect.fn("notes.files.writeTemporaryFile")(
  function* (path: string, content: string, mode: number) {
    const fs = yield* FileSystem.FileSystem;

    const temporary = join(
      dirname(path),
      `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const file = yield* fs.open(temporary, { flag: "wx", mode });
        yield* file.writeAll(new TextEncoder().encode(content));
        yield* file.sync;
      }),
    ).pipe(Effect.tapError(() => Effect.ignore(fs.remove(temporary))));

    return temporary;
  },
);

/** Atomically replace or create a validated note file. */
export const atomicWriteNoteFile = Effect.fn("notes.files.atomicWriteNoteFile")(
  function* (projectsRoot: string, input: string, content: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* resolveWritableNotePath(projectsRoot, input);

    const mode = (yield* fs.exists(path))
      ? (yield* fs.stat(path)).mode & 0o777
      : 0o666;

    const temporary = yield* writeTemporaryFile(path, content, mode);

    yield* Effect.gen(function* () {
      yield* resolveWritableNotePath(projectsRoot, path);
      yield* fs.rename(temporary, path);
    }).pipe(Effect.tapError(() => Effect.ignore(fs.remove(temporary))));

    return path;
  },
);

/** Create a complete draft without ever replacing an existing filename. */
export const createExclusiveNoteFile = Effect.fn(
  "notes.files.createExclusiveNoteFile",
)(function* (
  projectsRoot: string,
  owner: string,
  repo: string,
  slug: string,
  content: string,
) {
  const fs = yield* FileSystem.FileSystem;

  if (!isSafeRepositorySegment(owner) || !isSafeRepositorySegment(repo)) {
    return yield* failWith(`Invalid repository identity: ${owner}/${repo}`);
  }

  yield* ensurePhysicalParents(projectsRoot, owner, repo, true);
  const directory = join(projectsRoot, owner, repo);

  for (let suffix = 1; ; suffix += 1) {
    const filename = suffix === 1 ? `${slug}.md` : `${slug}-${suffix}.md`;

    const path = yield* resolveWritableNotePath(
      projectsRoot,
      join(directory, filename),
    );

    const temporary = yield* writeTemporaryFile(path, content, 0o666);

    const linked = yield* fs.link(temporary, path).pipe(
      Effect.as(true),
      Effect.catchIf(isAlreadyExists, () => Effect.succeed(false)),
      Effect.ensuring(Effect.ignore(fs.remove(temporary))),
    );

    if (linked) return path;
  }
});

/** Delete a validated physical note file. */
export const deleteNoteFile = Effect.fn("notes.files.deleteNoteFile")(
  function* (projectsRoot: string, input: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* resolveExistingNotePath(projectsRoot, input);
    yield* fs.remove(path);

    return path;
  },
);
