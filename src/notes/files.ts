import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { isSafeRepositorySegment } from "../git/remotes.js";
import { expandHomePath } from "../lib/paths.js";

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export interface ReadNoteFileResult {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
  readonly mtime: number;
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
): {
  readonly path: string;
  readonly owner: string;
  readonly repo: string;
  readonly filename: string;
} {
  const expanded = expandHomePath(input);
  if (!isAbsolute(expanded))
    throw new Error(`Note path must be absolute: ${input}`);

  const root = resolve(projectsRoot);
  const path = resolve(expanded);
  const relativePath = relative(root, path);
  if (!isInsideDirectory(root, path)) {
    throw new Error(`Path is outside the repository notes directory: ${input}`);
  }
  const parts = relativePath.split(sep);
  if (parts.length !== 3) {
    throw new Error(
      `Note path must match projects/<owner>/<repo>/<note>.md: ${input}`,
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
    throw new Error(`Invalid repository note path: ${input}`);
  }
  return { path, owner, repo, filename };
}

function assertDirectory(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Note directory is not a physical directory: ${path}`);
  }
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null
        ? (error as { readonly code?: unknown }).code
        : undefined;
    if (code === "ENOENT") return undefined;
    throw error;
  }
}

/** Create the vault root when needed and reject a symlinked root. */
export function ensurePhysicalVaultRoot(notesRoot: string): string {
  const path = resolve(notesRoot);
  if (!lstatIfPresent(path)) mkdirSync(path, { recursive: true });
  assertDirectory(path);
  return path;
}

function ensurePhysicalParents(
  projectsRoot: string,
  owner: string,
  repo: string,
  create: boolean,
): string {
  const root = resolve(projectsRoot);
  const notesRoot = dirname(root);
  assertDirectory(notesRoot);

  for (const path of [root, join(root, owner), join(root, owner, repo)]) {
    if (!lstatIfPresent(path)) {
      if (!create) throw new Error(`Note directory does not exist: ${path}`);
      mkdirSync(path);
    }
    assertDirectory(path);
  }

  const physicalRoot = realpathSync(root);
  const parent = join(root, owner, repo);
  const physicalParent = realpathSync(parent);
  if (!isInsideDirectory(physicalRoot, physicalParent)) {
    throw new Error(`Note directory resolves outside projects: ${parent}`);
  }
  return parent;
}

function assertRegularTarget(path: string, allowMissing: boolean): void {
  const stat = lstatIfPresent(path);
  if (!stat) {
    if (allowMissing) return;
    throw new Error(`Note file does not exist: ${path}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Note path is not a physical regular file: ${path}`);
  }
}

/** Resolve and validate one physical repository notes directory. */
export function resolveRepositoryNotesDirectory(
  projectsRoot: string,
  input: string,
): string {
  const root = resolve(projectsRoot);
  const path = resolve(input);
  const parts = relative(root, path).split(sep);
  if (
    !isInsideDirectory(root, path) ||
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    !isSafeRepositorySegment(parts[0]) ||
    !isSafeRepositorySegment(parts[1])
  ) {
    throw new Error(`Invalid repository notes directory: ${input}`);
  }
  return ensurePhysicalParents(root, parts[0], parts[1], false);
}

/** Resolve a valid note path whether or not its leaf currently exists. */
export function resolveOptionalNotePath(
  projectsRoot: string,
  input: string,
): string {
  return prepareNotePath(projectsRoot, input, {
    createParents: false,
    allowMissing: true,
  });
}

function prepareNotePath(
  projectsRoot: string,
  input: string,
  options: { readonly createParents: boolean; readonly allowMissing: boolean },
): string {
  const parts = notePathParts(projectsRoot, input);
  ensurePhysicalParents(
    projectsRoot,
    parts.owner,
    parts.repo,
    options.createParents,
  );
  assertRegularTarget(parts.path, options.allowMissing);
  return parts.path;
}

export function hashNoteContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Resolve and validate a note path for an existing physical file. */
export function resolveExistingNotePath(
  projectsRoot: string,
  input: string,
): string {
  return prepareNotePath(projectsRoot, input, {
    createParents: false,
    allowMissing: false,
  });
}

/** Resolve and validate a note path that may be created. */
export function resolveWritableNotePath(
  projectsRoot: string,
  input: string,
): string {
  return prepareNotePath(projectsRoot, input, {
    createParents: true,
    allowMissing: true,
  });
}

/** Read a regular note without following a leaf symlink. */
export function readNoteFile(
  projectsRoot: string,
  input: string,
): ReadNoteFileResult {
  const path = resolveExistingNotePath(projectsRoot, input);
  const fd = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile())
      throw new Error(`Note path is not a regular file: ${path}`);
    const content = readFileSync(fd, "utf8");
    return {
      path,
      content,
      hash: hashNoteContent(content),
      mtime: stat.mtimeMs / 1000,
    };
  } finally {
    closeSync(fd);
  }
}

function writeTemporaryFile(
  path: string,
  content: string,
  mode: number,
): string {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const fd = openSync(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
    mode,
  );
  try {
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    unlinkSync(temporary);
    throw error;
  }
  closeSync(fd);
  return temporary;
}

/** Atomically replace or create a validated note file. */
export function atomicWriteNoteFile(
  projectsRoot: string,
  input: string,
  content: string,
): string {
  const path = resolveWritableNotePath(projectsRoot, input);
  const mode = existsSync(path) ? statSync(path).mode & 0o777 : 0o666;
  const temporary = writeTemporaryFile(path, content, mode);
  try {
    resolveWritableNotePath(projectsRoot, path);
    renameSync(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  return path;
}

/** Create a complete draft without ever replacing an existing filename. */
export function createExclusiveNoteFile(
  projectsRoot: string,
  owner: string,
  repo: string,
  slug: string,
  content: string,
): string {
  if (!isSafeRepositorySegment(owner) || !isSafeRepositorySegment(repo)) {
    throw new Error(`Invalid repository identity: ${owner}/${repo}`);
  }
  ensurePhysicalParents(projectsRoot, owner, repo, true);
  const directory = join(projectsRoot, owner, repo);
  for (let suffix = 1; ; suffix += 1) {
    const filename = suffix === 1 ? `${slug}.md` : `${slug}-${suffix}.md`;
    const path = resolveWritableNotePath(
      projectsRoot,
      join(directory, filename),
    );
    const temporary = writeTemporaryFile(path, content, 0o666);
    try {
      linkSync(temporary, path);
      unlinkSync(temporary);
      return path;
    } catch (error) {
      unlinkSync(temporary);
      const code =
        typeof error === "object" && error !== null
          ? (error as { readonly code?: unknown }).code
          : undefined;
      if (code !== "EEXIST") throw error;
    }
  }
}

/** Delete a validated physical note file. */
export function deleteNoteFile(projectsRoot: string, input: string): string {
  const path = resolveExistingNotePath(projectsRoot, input);
  unlinkSync(path);
  return path;
}
