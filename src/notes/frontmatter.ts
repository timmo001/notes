import { Schema } from "effect";
import { isMap, parseDocument, stringify } from "yaml";
import type {
  NoteFrontmatter,
  NotePriority,
  RepoNoteIdentity,
} from "./types.js";
import { parseNotePriority } from "./types.js";

const Frontmatter = Schema.Struct({
  repo: Schema.optional(Schema.String),
  date: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  priority: Schema.optional(Schema.String),
});

type FrontmatterRecord = typeof Frontmatter.Type;

export interface DraftFrontmatter {
  readonly repo: string;
  readonly date: string;
  readonly type?: "handoff";
  readonly name: string;
  readonly description: string;
  readonly priority?: NotePriority;
  readonly tags: readonly string[];
}

interface ParsedFrontmatter {
  readonly document: ReturnType<typeof parseDocument>;
  readonly data: FrontmatterRecord;
  readonly body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!match) throw new Error("Note content must start with YAML frontmatter");

  const document = parseDocument(match[1], {
    schema: "failsafe",
    strict: true,
    stringKeys: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`Invalid note frontmatter: ${document.errors[0].message}`);
  }
  if (!isMap(document.contents)) {
    throw new Error("Note frontmatter must be a YAML mapping");
  }

  let data: FrontmatterRecord;
  try {
    data = Schema.decodeUnknownSync(Frontmatter)(
      document.toJS({ maxAliasCount: 0 }),
    );
  } catch (error) {
    throw new Error(
      `Invalid note frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validateKnownFields(data);
  return {
    document,
    data,
    body: content.slice(match[0].length),
  };
}

function validateKnownFields(data: FrontmatterRecord): void {
  if (
    data.priority !== undefined &&
    parseNotePriority(data.priority) === null
  ) {
    throw new Error(
      "Note frontmatter field priority must be low, medium, high, or critical",
    );
  }
}

/** Parse the metadata used by note listings. */
export function readFrontmatter(content: string): NoteFrontmatter {
  const { data, body } = parseFrontmatter(content);
  const heading = body.match(/^#\s+(.+)\s*$/m)?.[1]?.trim();
  return {
    name:
      data.name !== undefined
        ? data.name
        : data.title !== undefined
          ? data.title
          : heading || null,
    description: data.description ?? null,
    tags: data.tags ?? [],
    priority:
      data.priority === undefined ? null : parseNotePriority(data.priority),
  };
}

/** Validate note frontmatter and set one top-level field. */
export function setFrontmatterField(
  content: string,
  key: "date" | "priority",
  value: string,
): string {
  const { document, body } = parseFrontmatter(content);
  document.set(key, value);
  return `---\n${document.toString().trimEnd()}\n---${body}`;
}

/** Render a new note with YAML-safe frontmatter values. */
export function renderDraft(
  kind: "note" | "handoff",
  identity: RepoNoteIdentity,
  date: string,
  name: string,
  description: string,
): string {
  const frontmatter: DraftFrontmatter =
    kind === "handoff"
      ? {
          repo: `${identity.owner}/${identity.repo}`,
          date,
          type: "handoff",
          name,
          description: description || "Draft handoff note.",
          priority: "medium",
          tags: ["handoff", "draft"],
        }
      : {
          repo: `${identity.owner}/${identity.repo}`,
          date,
          name,
          description: description || "Draft repository note.",
          tags: ["draft"],
        };
  const body =
    kind === "handoff"
      ? [
          `# ${name}`,
          "",
          "## Summary",
          "",
          "",
          "## Next Focus",
          "",
          "",
          "## Suggested Skills",
          "",
          "",
          "## Artifact References",
          "",
          "",
          "## Open Threads",
          "",
          "",
        ]
      : [`# ${name}`, "", ""];
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body.join("\n")}`;
}

/** Validate a complete note without changing it. */
export function validateNoteContent(content: string): void {
  parseFrontmatter(content);
}
