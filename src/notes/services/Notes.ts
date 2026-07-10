import { Clock, Context, Effect, Layer, Schema, Semaphore } from "effect";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  commitIn,
  ensureRepo,
  hasStagedChanges,
  preflightMutation,
  pushBranch,
  stageIn,
} from "../../git/committer.js";
import { parseRepositoryRemoteUrl } from "../../git/remotes.js";
import { Config } from "../../services/Config.js";
import { CommandExecutor } from "../../services/CommandExecutor.js";
import {
  atomicWriteNoteFile,
  createExclusiveNoteFile,
  deleteNoteFile,
  ensurePhysicalVaultRoot,
  hashNoteContent,
  readNoteFile,
  resolveExistingNotePath,
  resolveOptionalNotePath,
  resolveRepositoryNotesDirectory,
  resolveWritableNotePath,
} from "../files.js";
import {
  readFrontmatter,
  renderDraft,
  setFrontmatterField,
  validateNoteContent,
} from "../frontmatter.js";
import { formatNoteTimestamp } from "../time.js";
import { acquireVaultLock } from "../processLock.js";
import {
  formatNoteLabel,
  type NoteCommitResult,
  type NoteContextOptions,
  type NoteContextPayload,
  type NoteCreateDraft,
  type NoteCreateKind,
  type NoteCreateResult,
  type NoteDeleteResult,
  type NoteEntry,
  type NoteFrontmatter,
  type NoteGitResult,
  type NotePriority,
  type NotePushResult,
  type NoteReadResult,
  type NoteRepoSection,
  type NoteWriteOptions,
  type NoteWriteResult,
  type RepoNoteIdentity,
} from "../types.js";

const NOTES_SUBDIR = "repo-notes";
const COMMANDS_NEEDING_LIST = new Set<string>([
  "note-append",
  "notes-list",
  "notes-search",
  "note-reference",
  "handoffs-list",
]);

/** Domain error for repo-note operations. */
export class NotesError extends Schema.TaggedErrorClass<NotesError>()(
  "NotesError",
  {
    message: Schema.String,
    detail: Schema.optional(Schema.String),
  },
) {}

/** Service interface for repo-scoped note context and file I/O. */
interface NotesService {
  readonly root: Effect.Effect<string, NotesError>;
  readonly repoNotesRoot: Effect.Effect<string, NotesError>;
  readonly contextPayload: (
    options: NoteContextOptions,
  ) => Effect.Effect<NoteContextPayload, NotesError>;
  readonly context: (
    options: NoteContextOptions,
  ) => Effect.Effect<string, NotesError>;
  readonly list: () => Effect.Effect<readonly NoteEntry[], NotesError>;
  readonly listAll: () => Effect.Effect<readonly NoteRepoSection[], NotesError>;
  readonly read: (
    filePath: string,
  ) => Effect.Effect<NoteReadResult, NotesError>;
  readonly write: (
    filePath: string,
    content: string,
    options?: NoteWriteOptions,
  ) => Effect.Effect<NoteWriteResult, NotesError>;
  readonly delete: (
    filePath: string,
  ) => Effect.Effect<NoteDeleteResult, NotesError>;
  readonly create: (
    kind: NoteCreateKind,
    name: string,
    description: string,
    runEditor: (entry: NoteEntry) => Promise<void>,
  ) => Effect.Effect<NoteCreateResult, NotesError>;
  readonly edit: (
    filePath: string,
    runEditor: (entry: NoteEntry) => Promise<void>,
    create: boolean,
  ) => Effect.Effect<NoteGitResult, NotesError>;
  readonly setPriority: (
    filePath: string,
    priority: NotePriority,
  ) => Effect.Effect<NoteGitResult, NotesError>;
}

type CommandResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

function errorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const stderr = record.stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
    const message = record.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return String(error);
}

function readNoteFrontmatter(
  repoNotesRoot: string,
  filePath: string,
): NoteFrontmatter {
  try {
    return readFrontmatter(readNoteFile(repoNotesRoot, filePath).content);
  } catch {
    return { name: null, description: null, tags: [], priority: null };
  }
}

function listNoteEntries(
  repoNotesRoot: string,
  notesPath: string,
  repoSlug?: string,
): readonly NoteEntry[] {
  if (!existsSync(notesPath)) return [];
  const physicalNotesPath = resolveRepositoryNotesDirectory(
    repoNotesRoot,
    notesPath,
  );

  return readdirSync(physicalNotesPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .map((filename) => {
      const filePath = join(physicalNotesPath, filename);
      const stat = lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error(
          `Note path is not a physical regular file: ${filePath}`,
        );
      }
      return {
        filename,
        filePath,
        repoSlug,
        mtime: stat.mtimeMs / 1000,
        ...readNoteFrontmatter(repoNotesRoot, filePath),
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function sortedDirectories(path: string) {
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listNoteRepoSections(
  repoNotesRoot: string,
): readonly NoteRepoSection[] {
  try {
    const rootStat = lstatSync(repoNotesRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error(
        `Repository notes root is not a physical directory: ${repoNotesRoot}`,
      );
    }
  } catch (error) {
    const code =
      typeof error === "object" && error !== null
        ? (error as { readonly code?: unknown }).code
        : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  const sections: NoteRepoSection[] = [];
  for (const owner of sortedDirectories(repoNotesRoot)) {
    const ownerPath = join(repoNotesRoot, owner.name);
    for (const repo of sortedDirectories(ownerPath)) {
      const repoSlug = `${owner.name}/${repo.name}`;
      const notesPath = join(ownerPath, repo.name);
      const entries = listNoteEntries(repoNotesRoot, notesPath, repoSlug);
      if (entries.length > 0) sections.push({ repoSlug, notesPath, entries });
    }
  }

  return sections;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatTag(
  name: string,
  description: string,
  lines: readonly string[],
): string {
  const body = [`Description: ${description}`, ...lines.filter(Boolean)]
    .join("\n")
    .trim();
  return [`<${name}>`, body || "(empty)", `</${name}>`].join("\n");
}

function payloadToContextBlock(payload: NoteContextPayload): string {
  if (payload.error) {
    return [
      "<repo-note-context>",
      formatTag(
        "metadata",
        "Information about how this repo-note context was generated.",
        [`Generated at: ${payload.generatedAt}`],
      ),
      formatTag(
        "warnings",
        "Issues encountered while collecting repo context.",
        [
          payload.error.message,
          payload.error.detail ? `Error: ${payload.error.detail}` : "",
        ],
      ),
      "</repo-note-context>",
    ].join("\n\n");
  }

  const repository = payload.repository;
  const parts = [
    "<repo-note-context>",
    formatTag("metadata", "How this context was generated.", [
      "RepoNotesPlugin generated this context. Use it to locate and manage notes for this repository.",
      `Generated at: ${payload.generatedAt}`,
    ]),
    formatTag(
      "repository",
      "Current repository identity and resolved notes path.",
      [
        `Owner: ${repository?.owner ?? "(unknown)"}`,
        `Repo: ${repository?.repo ?? "(unknown)"}`,
        `Remote: ${repository ? `${repository.remote} (${repository.remoteUrl})` : "(unknown)"}`,
        `Notes root: ${payload.notesRoot}`,
        `Notes path: ${payload.notesPath ?? "(unknown)"}`,
        `Notes directory exists: ${payload.notesExist ? "yes" : "no"}`,
      ],
    ),
  ];

  if (COMMANDS_NEEDING_LIST.has(payload.command)) {
    const notesLines =
      payload.entries.length > 0
        ? payload.entries.map(formatNoteLabel)
        : payload.notesExist
          ? ["(no .md files found in notes directory)"]
          : ["(notes directory does not exist yet)"];
    parts.push(
      formatTag(
        "existing-notes",
        "Existing note files for this repository, sorted newest-first by modification time.",
        notesLines,
      ),
    );
  }

  if (payload.contents?.length) {
    const contentParts = [
      "<note-contents>",
      "Description: Full content of all note files for this repository.",
    ];
    for (const note of payload.contents) {
      contentParts.push(
        `<note file="${note.filename}">`,
        note.content.trim(),
        "</note>",
      );
    }
    contentParts.push("</note-contents>");
    parts.push(contentParts.join("\n"));
  }

  if (payload.warnings.length) {
    parts.push(
      formatTag(
        "warnings",
        "Non-fatal issues encountered while collecting repo note context.",
        payload.warnings,
      ),
    );
  }

  parts.push("</repo-note-context>");
  return parts.join("\n\n");
}

function commitOutputLine(result: NoteCommitResult, message: string): string[] {
  if (result.ok && result.committed)
    return ["", `Committed to git: \`${message}\``];
  if (!result.ok)
    return ["", `Git commit failed (saved locally): ${result.error}`];
  return [];
}

/** Effect service for note vault operations. */
export class Notes extends Context.Service<Notes, NotesService>()("Notes") {
  static readonly layer = Layer.effect(
    Notes,
    Effect.gen(function* () {
      const config = yield* Config;
      const executor = yield* CommandExecutor;
      const notesRoot = resolve(config.notesDir);
      const repoNotesRoot = join(notesRoot, NOTES_SUBDIR);
      const mutationLock = yield* Semaphore.make(1);

      const withMutationLock = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        mutationLock.withPermit(
          Effect.acquireUseRelease(
            Effect.try({
              try: () => ensurePhysicalVaultRoot(notesRoot),
              catch: (error) =>
                fail(`Invalid notes vault: ${errorMessage(error)}`),
            }).pipe(
              Effect.flatMap(() =>
                Effect.tryPromise({
                  try: () => acquireVaultLock(notesRoot),
                  catch: (error) =>
                    fail(
                      `Unable to lock the notes vault: ${errorMessage(error)}`,
                    ),
                }),
              ),
            ),
            () => effect,
            (release) => Effect.promise(() => release()),
          ),
        );

      const commandResult = (
        cmd: string,
        args: readonly string[],
        opts?: { readonly cwd?: string },
      ): Effect.Effect<CommandResult> =>
        executor.run(cmd, args, opts).pipe(
          Effect.map((text) => ({ ok: true as const, text: text.trim() })),
          Effect.catch((error) =>
            Effect.succeed({ ok: false as const, error: errorMessage(error) }),
          ),
        );

      const fail = (message: string, detail?: string) =>
        new NotesError({ message, detail });

      const resolveIdentity = Effect.fn("Notes.resolveIdentity")(function* () {
        const inRepo = yield* commandResult("git", [
          "rev-parse",
          "--is-inside-work-tree",
        ]);
        if (!inRepo.ok || inRepo.text !== "true") {
          return yield* fail(
            "RepoNotesPlugin: not inside a git worktree - cannot resolve owner/repo.",
            inRepo.ok ? undefined : inRepo.error,
          );
        }

        const warnings: string[] = [];
        const remotesResult = yield* commandResult("git", ["remote"]);
        const remotes = remotesResult.ok
          ? remotesResult.text
              .split(/\r?\n/g)
              .map((remote) => remote.trim())
              .filter(Boolean)
          : [];

        if (!remotesResult.ok)
          warnings.push(`Unable to list git remotes: ${remotesResult.error}`);
        if (remotes.length === 0)
          warnings.push("No git remotes detected; defaulting to origin");

        const remote = remotes.includes("upstream")
          ? "upstream"
          : remotes.includes("origin")
            ? "origin"
            : (remotes[0] ?? "origin");
        const remoteUrl = yield* commandResult("git", [
          "remote",
          "get-url",
          remote,
        ]);

        if (!remoteUrl.ok) {
          return yield* fail(
            `RepoNotesPlugin: unable to read URL for remote "${remote}".`,
            remoteUrl.error,
          );
        }

        const parsed = parseRepositoryRemoteUrl(remoteUrl.text);
        if (!parsed) {
          return yield* fail(
            `RepoNotesPlugin: could not parse owner/repo from remote URL: ${remoteUrl.text}`,
          );
        }

        return {
          identity: { ...parsed, remote, remoteUrl: remoteUrl.text },
          warnings,
        };
      });

      const currentNotesPath = Effect.fn("Notes.currentNotesPath")(
        function* () {
          const { identity } = yield* resolveIdentity();
          return join(repoNotesRoot, identity.owner, identity.repo);
        },
      );

      const withExecutor = <A, E>(
        effect: Effect.Effect<A, E, CommandExecutor>,
      ): Effect.Effect<A, E> =>
        effect.pipe(Effect.provideService(CommandExecutor, executor));

      const toNoteCommitResult = (outcome: {
        readonly ok: boolean;
        readonly committed: boolean;
        readonly text: string;
        readonly error?: string;
      }): NoteCommitResult =>
        outcome.ok
          ? { ok: true, committed: outcome.committed, text: outcome.text }
          : { ok: false, committed: false, error: outcome.error };

      const prepareMutation = Effect.fn("Notes.prepareMutation")(function* () {
        const init = yield* withExecutor(ensureRepo(notesRoot));
        if (!init.ok) {
          return yield* fail(
            "Unable to prepare the notes repository.",
            init.error,
          );
        }
        const preflight = yield* withExecutor(preflightMutation(notesRoot));
        if (!preflight.ok) {
          return yield* fail(
            "The notes repository is not ready for a mutation.",
            preflight.error,
          );
        }
      });

      const commitNote = Effect.fn("Notes.commitNote")(function* (
        filePath: string,
        message: string,
      ) {
        if (yield* withExecutor(hasStagedChanges(notesRoot))) {
          return {
            ok: false as const,
            committed: false,
            text: "",
            error:
              "The notes repository gained staged changes before the note could be committed. The note was saved locally and nothing new was staged.",
          };
        }
        const relativePath = relative(notesRoot, filePath);
        const init = yield* withExecutor(ensureRepo(notesRoot));
        if (!init.ok) {
          return {
            ok: false as const,
            committed: false,
            text: "",
            error: `git init failed: ${init.error ?? "unknown error"}`,
          };
        }
        const staged = yield* withExecutor(
          stageIn(
            { mode: "paths", paths: [relativePath] },
            { cwd: notesRoot, io: "capture" },
          ),
        );
        if (!staged.ok) {
          return {
            ok: false as const,
            committed: false,
            text: "",
            error: `git add failed: ${staged.error ?? "unknown error"}`,
          };
        }
        const outcome = yield* withExecutor(
          commitIn({
            cwd: notesRoot,
            message,
            noVerify: true,
            io: "capture",
            tolerateEmpty: true,
            paths: [relativePath],
          }),
        );
        return outcome.ok
          ? {
              ok: true as const,
              committed: outcome.committed,
              text: outcome.text,
            }
          : {
              ok: false as const,
              committed: false,
              text: "",
              error: `git commit failed: ${outcome.error ?? "unknown error"}`,
            };
      });

      const hasRemote = Effect.fn("Notes.hasRemote")(function* () {
        const isRepo = yield* commandResult("git", [
          "-C",
          notesRoot,
          "rev-parse",
          "--is-inside-work-tree",
        ]);
        if (!isRepo.ok) return false;
        const remotes = yield* commandResult("git", [
          "-C",
          notesRoot,
          "remote",
        ]);
        return remotes.ok && remotes.text.trim().length > 0;
      });

      const pushNotes = Effect.fn("Notes.pushNotes")(function* () {
        if (!(yield* hasRemote())) return undefined;
        const outcome = yield* withExecutor(
          pushBranch({ cwd: notesRoot, io: "capture" }),
        );
        return {
          ok: outcome.ok,
          message: outcome.message,
          error: outcome.error,
        } satisfies NotePushResult;
      });

      const commitAndPush = Effect.fn("Notes.commitAndPush")(function* (
        filePath: string,
        message: string,
      ) {
        const outcome = yield* commitNote(filePath, message);
        const push = outcome.committed ? yield* pushNotes() : undefined;
        return { commit: toNoteCommitResult(outcome), push };
      });

      const editAndCommit = Effect.fn("Notes.editAndCommit")(function* (
        filePath: string,
        runEditor: (entry: NoteEntry) => Promise<void>,
        create: boolean,
      ) {
        const before = yield* Effect.try({
          try: () => readNoteFile(repoNotesRoot, filePath),
          catch: (error) => fail(errorMessage(error)),
        });
        const entry: NoteEntry = {
          filename: basename(before.path),
          filePath: before.path,
          mtime: before.mtime,
          ...readNoteFrontmatter(repoNotesRoot, before.path),
        };
        yield* Effect.tryPromise({
          try: () => runEditor(entry),
          catch: (error) =>
            fail(`Editor failed for ${filePath}: ${errorMessage(error)}`),
        });
        const resolvedPath = resolveOptionalNotePath(repoNotesRoot, filePath);
        if (!existsSync(resolvedPath)) {
          if (create) {
            return {
              commit: {
                ok: true,
                committed: false,
                text: "draft file was removed",
              },
            };
          }
          const message = `notes: delete ${basename(resolvedPath)}`;
          return yield* commitAndPush(resolvedPath, message);
        }
        yield* Effect.try({
          try: () =>
            validateNoteContent(
              readNoteFile(repoNotesRoot, resolvedPath).content,
            ),
          catch: (error) =>
            fail(`Edited note is invalid: ${errorMessage(error)}`),
        });
        const filename = basename(resolvedPath);
        const message = `notes: ${create ? "create" : "edit"} ${filename}`;
        return yield* commitAndPush(resolvedPath, message);
      });

      const buildContextPayload = ({ command }: NoteContextOptions) =>
        Effect.gen(function* () {
          const generatedAt = new Date().toISOString();
          const resolved = yield* resolveIdentity().pipe(
            Effect.catch((error: NotesError) =>
              Effect.succeed({ error } as const),
            ),
          );
          if ("error" in resolved) {
            return {
              generatedAt,
              command,
              notesRoot,
              repoNotesRoot,
              entries: [],
              warnings: [],
              error: {
                message: resolved.error.message,
                detail: resolved.error.detail,
              },
            } satisfies NoteContextPayload;
          }

          const notesPath = join(
            repoNotesRoot,
            resolved.identity.owner,
            resolved.identity.repo,
          );
          const notesExist = existsSync(notesPath);
          const warnings = [...resolved.warnings];
          let entries: readonly NoteEntry[] = [];
          if (COMMANDS_NEEDING_LIST.has(command)) {
            const listed = yield* Effect.try({
              try: () => listNoteEntries(repoNotesRoot, notesPath),
              catch: (error) => errorMessage(error),
            }).pipe(
              Effect.match({
                onFailure: (error) => ({ ok: false as const, error }),
                onSuccess: (value) => ({ ok: true as const, value }),
              }),
            );
            if (listed.ok) entries = listed.value;
            else
              warnings.push(`Unable to list existing notes: ${listed.error}`);
          }
          const contents =
            command === "note-reference" && entries.length > 0
              ? entries.map((entry) => {
                  let content: string;
                  try {
                    content = readNoteFile(
                      repoNotesRoot,
                      entry.filePath,
                    ).content.trim();
                  } catch (error) {
                    content = `(error reading file: ${errorMessage(error)})`;
                  }
                  return {
                    filename: entry.filename,
                    filePath: entry.filePath,
                    content,
                  };
                })
              : undefined;

          return {
            generatedAt,
            command,
            notesRoot,
            repoNotesRoot,
            repository: resolved.identity,
            notesPath,
            notesExist,
            entries,
            contents,
            warnings,
          } satisfies NoteContextPayload;
        });

      return {
        root: Effect.succeed(notesRoot),
        repoNotesRoot: Effect.succeed(repoNotesRoot),
        contextPayload: buildContextPayload,
        context: (options) =>
          Effect.gen(function* () {
            return payloadToContextBlock(yield* buildContextPayload(options));
          }),
        list: () =>
          Effect.gen(function* () {
            const notesPath = yield* currentNotesPath();
            return listNoteEntries(repoNotesRoot, notesPath);
          }),
        listAll: () =>
          Effect.try({
            try: () => listNoteRepoSections(repoNotesRoot),
            catch: (error) =>
              fail(
                `notes list --all: failed to list notes: ${errorMessage(error)}`,
              ),
          }),
        read: (filePath) =>
          Effect.try({
            try: () => {
              const result = readNoteFile(repoNotesRoot, filePath);
              return {
                path: result.path,
                content: result.content,
                hash: result.hash,
              };
            },
            catch: (error) =>
              fail(
                `Failed to read note file ${filePath}: ${errorMessage(error)}`,
              ),
          }),
        write: (filePath, content, options = {}) =>
          withMutationLock(
            Effect.gen(function* () {
              yield* prepareMutation();
              const existing = yield* Effect.try({
                try: () => {
                  const resolvedPath = resolveWritableNotePath(
                    repoNotesRoot,
                    filePath,
                  );
                  return existsSync(resolvedPath)
                    ? readNoteFile(repoNotesRoot, resolvedPath)
                    : undefined;
                },
                catch: (error) =>
                  fail(
                    `Failed to inspect note file ${filePath}: ${errorMessage(error)}`,
                  ),
              });
              if (
                options.expectedHash !== undefined &&
                existing?.hash !== options.expectedHash
              ) {
                return yield* fail(
                  `Note changed since it was read: ${filePath}`,
                  `Expected ${options.expectedHash}, found ${existing?.hash ?? "no existing note"}.`,
                );
              }
              const stamped =
                options.stampDate === false
                  ? content
                  : setFrontmatterField(
                      content,
                      "date",
                      formatNoteTimestamp(
                        new Date(yield* Clock.currentTimeMillis),
                      ),
                    );
              yield* Effect.try({
                try: () => validateNoteContent(stamped),
                catch: (error) => fail(errorMessage(error)),
              });
              const resolvedPath = yield* Effect.try({
                try: () =>
                  atomicWriteNoteFile(repoNotesRoot, filePath, stamped),
                catch: (error) =>
                  fail(
                    `Failed to write note file ${filePath}: ${errorMessage(error)}`,
                  ),
              });
              const dir = dirname(resolvedPath);
              const filename = basename(resolvedPath);
              const message = `notes: write ${filename}`;
              const { commit, push } = yield* commitAndPush(
                resolvedPath,
                message,
              );
              const output = [
                `Written: ${resolvedPath}`,
                "",
                "```markdown",
                stamped,
                "```",
                ...commitOutputLine(commit, message),
                "",
                "## How to undo",
                "",
                "```sh",
                "# Revert to the previous version",
                `cd ${dir} && git log --oneline -5 -- ${filename}`,
                `cd ${dir} && git checkout HEAD~1 -- ${filename}`,
                "```",
              ].join("\n");

              return {
                path: resolvedPath,
                output,
                hash: hashNoteContent(stamped),
                commit,
                push,
              };
            }),
          ),
        delete: (filePath) =>
          withMutationLock(
            Effect.gen(function* () {
              yield* prepareMutation();
              const resolvedPath = yield* Effect.try({
                try: () => deleteNoteFile(repoNotesRoot, filePath),
                catch: (error) =>
                  fail(
                    `Failed to delete note file ${filePath}: ${errorMessage(error)}`,
                  ),
              });
              const dir = dirname(resolvedPath);
              const filename = basename(resolvedPath);
              const message = `notes: delete ${filename}`;
              const { commit, push } = yield* commitAndPush(
                resolvedPath,
                message,
              );
              const output = [
                `Deleted: ${resolvedPath}`,
                ...commitOutputLine(commit, message),
                "",
                "## How to undo",
                "",
                "```sh",
                "# Restore the deleted file",
                `cd ${dir} && git revert --no-commit HEAD && git checkout HEAD -- ${filename}`,
                "",
                "# Or restore directly from the commit before deletion",
                `cd ${dir} && git checkout HEAD~1 -- ${filename}`,
                "```",
              ].join("\n");

              return { path: resolvedPath, output, commit, push };
            }),
          ),
        create: (kind, name, description, runEditor) =>
          withMutationLock(
            Effect.gen(function* () {
              yield* prepareMutation();
              const { identity } = yield* resolveIdentity();
              const slug = slugifyName(name) || "note";
              const now = new Date(yield* Clock.currentTimeMillis);
              const content = renderDraft(
                kind,
                identity,
                formatNoteTimestamp(now),
                name,
                description,
              );
              const filePath = yield* Effect.try({
                try: () =>
                  createExclusiveNoteFile(
                    repoNotesRoot,
                    identity.owner,
                    identity.repo,
                    slug,
                    content,
                  ),
                catch: (error) =>
                  fail(
                    `createDraft: failed to write draft: ${errorMessage(error)}`,
                  ),
              });
              const note = readNoteFile(repoNotesRoot, filePath);
              const entry: NoteEntry = {
                filename: basename(filePath),
                filePath,
                mtime: note.mtime,
                ...readFrontmatter(note.content),
              };
              const draft = { entry, content } satisfies NoteCreateDraft;
              const git = yield* editAndCommit(filePath, runEditor, true);
              return { draft, git, created: existsSync(filePath) };
            }),
          ),
        edit: (filePath, runEditor, create) =>
          withMutationLock(
            Effect.gen(function* () {
              yield* prepareMutation();
              return yield* editAndCommit(filePath, runEditor, create);
            }),
          ),
        setPriority: (filePath, priority) =>
          withMutationLock(
            Effect.gen(function* () {
              yield* prepareMutation();
              const note = yield* Effect.try({
                try: () => readNoteFile(repoNotesRoot, filePath),
                catch: (error) =>
                  fail(
                    `setPriority: failed to read file ${filePath}: ${errorMessage(error)}`,
                  ),
              });
              const updated = yield* Effect.try({
                try: () =>
                  setFrontmatterField(note.content, "priority", priority),
                catch: (error) => fail(errorMessage(error)),
              });
              yield* Effect.try({
                try: () =>
                  atomicWriteNoteFile(repoNotesRoot, note.path, updated),
                catch: (error) =>
                  fail(
                    `setPriority: failed to write file ${filePath}: ${errorMessage(error)}`,
                  ),
              });
              const filename = basename(note.path);
              const message = `notes: set priority ${filename}`;
              return yield* commitAndPush(note.path, message);
            }),
          ),
      };
    }),
  );
}
