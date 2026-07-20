/** JSON-schema-ish property metadata for docs and MCP parameter schemas. */
export interface McpParameterMetadata {
  /** Parameter type label. */
  readonly type: "boolean" | "string";
  /** Human-readable parameter description. */
  readonly description: string;
  /** Whether the parameter is required. */
  readonly required?: boolean;
  /** CLI equivalent, when there is one. */
  readonly cli?: string;
  /** Default value description. */
  readonly default?: string;
}

/** MCP tool metadata used by docs generation. */
export interface McpToolMetadata {
  /** Tool name as exposed over MCP. */
  readonly name: string;
  /** Human-readable tool description. */
  readonly description: string;
  /** Equivalent CLI invocation. */
  readonly cli: string;
  /** Parameter metadata keyed by input property name. */
  readonly parameters: Readonly<Record<string, McpParameterMetadata>>;
}

/** Notes MCP tool metadata, kept in sync with registered schemas. */
export const mcpTools: readonly McpToolMetadata[] = [
  {
    name: "note_read",
    cli: "notes read --path <path>",
    description:
      "Read the full content and SHA-256 revision of a note file from the notes vault.",
    parameters: {
      path: {
        type: "string",
        required: true,
        cli: "--path <path>",
        description: "Absolute path to the note file inside the notes vault.",
      },
    },
  },
  {
    name: "note_list",
    cli: "notes list [--all] [--tag <tag>] --format json",
    description:
      "List note files in the notes vault for the current project, optionally filtered by tag or grouped across all projects.",
    parameters: {
      tag: {
        type: "string",
        cli: "--tag <tag>",
        description: "Optional tag to filter notes by, for example handoff.",
      },
      all: {
        type: "boolean",
        cli: "--all",
        default: "false",
        description:
          "List notes from all projects instead of just the current one.",
      },
    },
  },
  {
    name: "note_write",
    cli: "notes write --path <path> --stdin",
    description:
      "Write a note file to the notes vault, then commit and best-effort push it.",
    parameters: {
      path: {
        type: "string",
        required: true,
        cli: "--path <path>",
        description: "Absolute path to the note file to create or overwrite.",
      },
      content: {
        type: "string",
        required: true,
        cli: "stdin",
        description:
          "Full file content to write, including frontmatter and body.",
      },
      expectedHash: {
        type: "string",
        cli: "--expected-hash <sha256>",
        description:
          "Optional SHA-256 revision from note_read used to reject stale overwrites.",
      },
    },
  },
  {
    name: "note_delete",
    cli: "notes delete --path <path>",
    description:
      "Delete a note file from the notes vault, then commit and best-effort push it.",
    parameters: {
      path: {
        type: "string",
        required: true,
        cli: "--path <path>",
        description: "Absolute path to the note file to delete.",
      },
    },
  },
];
