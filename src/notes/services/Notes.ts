import { Clock, Context, Effect, Layer, Schema } from "effect";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
} from "node:path";
import {
  commitIn,
  ensureRepo,
  pushBranch,
  stageIn,
} from "../../git/committer.js";
import { expandHomePath } from "../../lib/paths.js";
import { Config } from "../../services/Config.js";
import { CommandExecutor } from "../../services/CommandExecutor.js";
import { formatNoteTimestamp } from "../time.js";
import {
  formatNoteLabel,
  parseNotePriority,
  type NoteCommitResult,
  type NoteContextOptions,
  type NoteContextPayload,
  type NoteDeleteResult,
  type NoteEntry,
  type NoteFrontmatter,
  type NotePushResult,
  type NoteRepoSection,
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
  readonly read: (filePath: string) => Effect.Effect<string, NotesError>;
  readonly write: (
    filePath: string,
    content: string,
    stampDate?: boolean,
  ) => Effect.Effect<NoteWriteResult, NotesError>;
  readonly delete: (
    filePath: string,
  ) => Effect.Effect<NoteDeleteResult, NotesError>;
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

function isInsideDirectory(parent: string, child: string): boolean {
  const relativePath = relative(resolve(parent), resolve(child));
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function parseRemoteUrl(
  url: string,
): Pick<RepoNoteIdentity, "owner" | "repo"> | null {
  const sshMatch = url.match(/^[^@]+@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  const httpsMatch = url.match(
    /^(?:https?|ssh):\/\/[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  return null;
}

function parseTags(value: string): readonly string[] {
  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function readNoteFrontmatter(filePath: string): NoteFrontmatter {
  let head: string;
  try {
    head = readFileSync(filePath, "utf-8").split("\n").slice(0, 20).join("\n");
  } catch {
    return { name: null, description: null, tags: [], priority: null };
  }
  const name =
    head
      .match(/^name:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") || null;
  const description =
    head
      .match(/^description:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") || null;
  const tagsRaw = head.match(/^tags:\s*\[(.+)\]$/m)?.[1];
  const priorityRaw = head.match(/^priority:\s*(.+)$/m)?.[1];
  return {
    name,
    description,
    tags: tagsRaw ? parseTags(tagsRaw) : [],
    priority: priorityRaw ? parseNotePriority(priorityRaw) : null,
  };
}

function setFrontmatterDate(content: string, date: string): string | null {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) return null;

  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const dateLine = `date: ${date}`;
  const lines = frontmatter[1].split(/\r?\n/);

  const existingIndex = lines.findIndex((line) => /^date:\s*/.test(line));
  if (existingIndex !== -1) {
    lines[existingIndex] = dateLine;
  } else {
    const repoIndex = lines.findIndex((line) => /^repo:\s*/.test(line));
    lines.splice(repoIndex !== -1 ? repoIndex + 1 : 0, 0, dateLine);
  }

  const body = lines.join(newline);
  return content.replace(
    frontmatter[0],
    () => `---${newline}${body}${newline}---`,
  );
}

function listNoteEntries(
  notesPath: string,
  repoSlug?: string,
): readonly NoteEntry[] {
  if (!existsSync(notesPath)) return [];

  return readdirSync(notesPath)
    .filter((filename) => filename.endsWith(".md"))
    .map((filename) => {
      const filePath = join(notesPath, filename);
      const stat = statSync(filePath);
      return {
        filename,
        filePath,
        repoSlug,
        mtime: stat.mtimeMs / 1000,
        ...readNoteFrontmatter(filePath),
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
  if (!existsSync(repoNotesRoot)) return [];

  const sections: NoteRepoSection[] = [];
  for (const owner of sortedDirectories(repoNotesRoot)) {
    const ownerPath = join(repoNotesRoot, owner.name);
    for (const repo of sortedDirectories(ownerPath)) {
      const repoSlug = `${owner.name}/${repo.name}`;
      const notesPath = join(ownerPath, repo.name);
      const entries = listNoteEntries(notesPath, repoSlug);
      if (entries.length > 0) sections.push({ repoSlug, notesPath, entries });
    }
  }

  return sections;
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
  return result.ok ? ["", `Committed to git: \`${message}\``] : [];
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

      const assertInsideNotesRoot = (filePath: string) =>
        Effect.try({
          try: () => {
            const expanded = expandHomePath(filePath);
            if (!isInsideDirectory(notesRoot, expanded)) {
              throw fail(`Path is outside the notes vault: ${filePath}`);
            }
            return resolve(expanded);
          },
          catch: (error) =>
            error instanceof NotesError ? error : fail(errorMessage(error)),
        });

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

        const parsed = parseRemoteUrl(remoteUrl.text);
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
        readonly text: string;
        readonly error?: string;
      }): NoteCommitResult =>
        outcome.ok
          ? { ok: true, text: outcome.text }
          : { ok: false, error: outcome.error };

      const commitNote = Effect.fn("Notes.commitNote")(function* (
        filePath: string,
        message: string,
      ) {
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
              try: () => listNoteEntries(notesPath),
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
                    content = readFileSync(entry.filePath, "utf-8").trim();
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
            return listNoteEntries(notesPath);
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
          Effect.gen(function* () {
            const resolvedPath = yield* assertInsideNotesRoot(filePath);
            return yield* Effect.try({
              try: () => readFileSync(resolvedPath, "utf-8"),
              catch: (error) =>
                fail(
                  `Failed to read note file ${filePath}: ${errorMessage(error)}`,
                ),
            });
          }),
        write: (filePath, content, stampDate = true) =>
          Effect.gen(function* () {
            const resolvedPath = yield* assertInsideNotesRoot(filePath);
            const dir = dirname(resolvedPath);
            const filename = basename(resolvedPath);
            const stamped = stampDate
              ? (setFrontmatterDate(
                  content,
                  formatNoteTimestamp(new Date(yield* Clock.currentTimeMillis)),
                ) ?? content)
              : content;
            yield* Effect.try({
              try: () => {
                mkdirSync(dir, { recursive: true });
                writeFileSync(resolvedPath, stamped);
              },
              catch: (error) =>
                fail(
                  `Failed to write note file ${filePath}: ${errorMessage(error)}`,
                ),
            });

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

            return { path: resolvedPath, output, commit, push };
          }),
        delete: (filePath) =>
          Effect.gen(function* () {
            const resolvedPath = yield* assertInsideNotesRoot(filePath);
            const dir = dirname(resolvedPath);
            const filename = basename(resolvedPath);
            yield* Effect.try({
              try: () => unlinkSync(resolvedPath),
              catch: (error) => {
                const code =
                  typeof error === "object" && error !== null
                    ? (error as Record<string, unknown>).code
                    : undefined;
                return fail(
                  code === "ENOENT"
                    ? `Note file does not exist: ${filePath}`
                    : `Failed to delete note file ${filePath}: ${errorMessage(error)}`,
                );
              },
            });

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
      };
    }),
  );
}
