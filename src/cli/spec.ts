/** Named value completion candidates for a CLI option. */
export interface CliValueChoice {
  /** Value inserted on the command line. */
  readonly value: string;
  /** Human-readable completion/help description. */
  readonly description?: string;
}

/** Positional argument shown in help/completion output. */
export interface CliArgumentSpec {
  /** Argument label, without angle brackets. */
  readonly name: string;
  /** Human-readable description. */
  readonly description?: string;
  /** Completion strategy for this argument. */
  readonly completion?: "file" | "shell" | "none";
  /** Fixed completion candidates for this argument. */
  readonly choices?: readonly CliValueChoice[];
  /** Whether the argument can repeat. */
  readonly repeatable?: boolean;
}

/** CLI option/flag metadata. */
export interface CliOptionSpec {
  /** Long option name, including leading dashes. */
  readonly name: `--${string}`;
  /** Optional short option alias, including leading dash. */
  readonly short?: `-${string}`;
  /** Human-readable description. */
  readonly description: string;
  /** Value label shown in help, when the option takes a value. */
  readonly valueName?: string;
  /** Completion strategy for the value. */
  readonly completion?: "file" | "shell" | "none";
  /** Fixed value candidates. */
  readonly choices?: readonly CliValueChoice[];
}

/** Extra help section rendered after options. */
export interface CliHelpSection {
  /** Section title. */
  readonly title: string;
  /** Section lines. */
  readonly lines: readonly string[];
}

/** CLI command/subcommand metadata used for help, docs, and completions. */
export interface CliCommandSpec {
  /** Canonical command name. */
  readonly name: string;
  /** Human-readable summary for command listings. */
  readonly summary: string;
  /** Aliases accepted by the CLI. */
  readonly aliases?: readonly string[];
  /** Usage suffix after `notes <name>`. */
  readonly usage?: string;
  /** Long description paragraphs. */
  readonly description?: readonly string[];
  /** Mode lines rendered before options. */
  readonly modes?: readonly string[];
  /** Nested subcommands. */
  readonly commands?: readonly CliCommandSpec[];
  /** Command options. */
  readonly options?: readonly CliOptionSpec[];
  /** Positional arguments. */
  readonly arguments?: readonly CliArgumentSpec[];
  /** Additional help sections. */
  readonly sections?: readonly CliHelpSection[];
  /** Example command lines. */
  readonly examples?: readonly string[];
}

const helpOption = {
  name: "--help",
  short: "-h",
  description: "Show this help message",
} satisfies CliOptionSpec;

const allOption = {
  name: "--all",
  description: "Show notes from every projects directory",
} satisfies CliOptionSpec;

const formatOption = {
  name: "--format",
  valueName: "labels|json",
  description: "Output format",
  choices: [{ value: "labels" }, { value: "json" }],
} satisfies CliOptionSpec;

const listOption = {
  name: "--list",
  description: "List handoffs to stdout instead of opening the TUI",
} satisfies CliOptionSpec;

const pathOption = {
  name: "--path",
  valueName: "path",
  completion: "file",
  description: "Absolute path to a note file inside the notes vault",
} satisfies CliOptionSpec;

const expectedHashOption = {
  name: "--expected-hash",
  valueName: "sha256",
  description: "Fail if the existing note no longer has this SHA-256 hash",
} satisfies CliOptionSpec;

/** Top-level notes command descriptors. */
export const cliCommands: readonly CliCommandSpec[] = [
  {
    name: "root",
    summary: "Print the notes vault root",
    usage: "[--projects]",
    options: [
      {
        name: "--projects",
        description: "Print the projects directory",
      },
      helpOption,
    ],
    examples: ["notes root", "notes root --projects"],
  },
  {
    name: "context",
    summary: "Print project-note context for integration plugins",
    usage: "--command <name> [--json]",
    description: [
      "Resolve the current project, its notes directory, and relevant existing notes.",
      "The --json form is intended for OpenCode plugins that render their own prompt context.",
    ],
    options: [
      {
        name: "--command",
        valueName: "name",
        description: "Integration command name requesting context",
      },
      {
        name: "--json",
        description: "Emit structured context JSON",
      },
      helpOption,
    ],
    examples: [
      "notes context --command notes-list",
      "notes context --command note-reference --json",
    ],
  },
  {
    name: "list",
    summary: "List repository notes",
    usage: "[--all] [--tag <tag>] [--format labels|json]",
    options: [
      allOption,
      {
        name: "--tag",
        valueName: "tag",
        description: "Only include notes with this tag",
      },
      formatOption,
      helpOption,
    ],
    examples: [
      "notes list",
      "notes list --all",
      "notes list --tag handoff",
      "notes list --format json",
    ],
  },
  {
    name: "read",
    summary: "Print a note file",
    usage: "--path <path> [--json]",
    options: [
      pathOption,
      { name: "--json", description: "Emit content and revision hash as JSON" },
      helpOption,
    ],
    examples: [
      "notes read --path ~/Documents/notes/projects/owner/repo/topic.md",
    ],
  },
  {
    name: "write",
    summary: "Write stdin to a note file, then commit and push it",
    usage: "--path <path> --stdin [--expected-hash <sha256>] [--json]",
    options: [
      pathOption,
      { name: "--stdin", description: "Read note content from stdin" },
      expectedHashOption,
      {
        name: "--json",
        description: "Emit the complete mutation result as JSON",
      },
      helpOption,
    ],
    examples: [
      "notes write --path ~/Documents/notes/projects/owner/repo/topic.md --stdin",
    ],
  },
  {
    name: "delete",
    summary: "Delete a note file, then commit and push it",
    usage: "--path <path> [--json]",
    options: [
      pathOption,
      {
        name: "--json",
        description: "Emit the complete mutation result as JSON",
      },
      helpOption,
    ],
    examples: [
      "notes delete --path ~/Documents/notes/projects/owner/repo/topic.md",
    ],
  },
  {
    name: "handoffs",
    aliases: ["handoff"],
    summary: "Browse handoff-tagged notes",
    usage: "[--all] [--list] [--format labels|json]",
    description: [
      "Handoffs are normal notes tagged handoff. Priority metadata is shared with notes.",
      "With no flags this opens the interactive notes TUI filtered to handoffs.",
    ],
    options: [allOption, listOption, formatOption, helpOption],
    examples: [
      "notes handoffs",
      "notes handoffs --all",
      "notes handoffs --list",
      "notes handoff",
    ],
  },
  {
    name: "mcp",
    summary: "Run the notes MCP server over stdio",
    description: [
      "Start a Model Context Protocol server exposing note read, list, write, and delete tools.",
    ],
    options: [helpOption],
    examples: ["notes mcp"],
  },
  {
    name: "completions",
    summary: "Generate shell completions",
    usage: "[bash|fish|zsh]",
    description: ["Generate shell completions for notes."],
    arguments: [
      {
        name: "shell",
        choices: [{ value: "bash" }, { value: "fish" }, { value: "zsh" }],
        completion: "shell",
      },
    ],
    options: [helpOption],
    examples: [
      "notes completions zsh",
      "notes completions bash",
      "notes completions fish",
    ],
  },
  {
    name: "help",
    summary: "Show notes help",
    usage: "[command]",
    arguments: [
      {
        name: "command",
        description: "Optional command to show help for",
        choices: [
          { value: "root" },
          { value: "context" },
          { value: "list" },
          { value: "read" },
          { value: "write" },
          { value: "delete" },
          { value: "handoffs" },
          { value: "mcp" },
          { value: "completions" },
        ],
      },
    ],
    options: [helpOption],
    examples: ["notes help", "notes help list"],
  },
];

/** All native command names and aliases. */
export const nativeCommandNames: ReadonlySet<string> = new Set(
  cliCommands.flatMap((command) => [command.name, ...(command.aliases ?? [])]),
);

/** Return a command by canonical name or alias. */
export function getCliCommand(name: string): CliCommandSpec | undefined {
  return cliCommands.find(
    (command) => command.name === name || command.aliases?.includes(name),
  );
}
