import { isMap, parseDocument, stringify } from "yaml";
import type {
  NoteFrontmatter,
  NotePriority,
  RepoNoteIdentity,
} from "./types.js";
import { parseNotePriority } from "./types.js";

type FrontmatterRecord = Record<string, unknown>;

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

  let data: unknown;
  try {
    data = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(
      `Invalid note frontmatter: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Note frontmatter must be a YAML mapping");
  }

  validateKnownFields(data as FrontmatterRecord);
  return {
    document,
    data: data as FrontmatterRecord,
    body: content.slice(match[0].length),
  };
}

function validateKnownFields(data: FrontmatterRecord): void {
  for (const key of ["repo", "date", "type", "name", "description"] as const) {
    if (data[key] !== undefined && typeof data[key] !== "string") {
      throw new Error(`Note frontmatter field ${key} must be a string`);
    }
  }
  if (
    data.tags !== undefined &&
    (!Array.isArray(data.tags) ||
      data.tags.some((tag: unknown) => typeof tag !== "string"))
  ) {
    throw new Error("Note frontmatter field tags must be a string array");
  }
  if (
    data.priority !== undefined &&
    (typeof data.priority !== "string" ||
      parseNotePriority(data.priority) === null)
  ) {
    throw new Error(
      "Note frontmatter field priority must be low, medium, high, or critical",
    );
  }
}

/** Parse the metadata used by note listings. */
export function readFrontmatter(content: string): NoteFrontmatter {
  const { data } = parseFrontmatter(content);
  return {
    name: typeof data.name === "string" ? data.name : null,
    description: typeof data.description === "string" ? data.description : null,
    tags: Array.isArray(data.tags) ? (data.tags as readonly string[]) : [],
    priority:
      typeof data.priority === "string"
        ? parseNotePriority(data.priority)
        : null,
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
  const frontmatter: DraftFrontmatter = {
    repo: `${identity.owner}/${identity.repo}`,
    date,
    ...(kind === "handoff" ? { type: "handoff" as const } : {}),
    name,
    description:
      description ||
      `Draft ${kind === "handoff" ? "handoff" : "repository"} note.`,
    ...(kind === "handoff" ? { priority: "medium" as const } : {}),
    tags: kind === "handoff" ? ["handoff", "draft"] : ["draft"],
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
