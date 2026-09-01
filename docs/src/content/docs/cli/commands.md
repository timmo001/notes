---
title: Command Reference
description: Every notes command and flag, generated from the Effect command tree.
sidebar:
  order: 2
---

<!-- Generated from the Effect command tree by `mise run docs:gen:cli`. Do not edit by hand. -->

This page is generated from the same `Command` values that parse and run the CLI.

## `notes root`

```text
DESCRIPTION
  Print the notes vault root

USAGE
  notes root [flags]

FLAGS
  --projects    Print the projects directory

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

EXAMPLES
  notes root
  notes root --projects
```

## `notes context`

```text
DESCRIPTION
  Resolve project-note context for integration plugins.

USAGE
  notes context [flags]

FLAGS
  --command string    Integration command name requesting context
  --json              Emit structured context JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

EXAMPLES
  notes context --command notes-list
  notes context --command note-reference --json
```

## `notes list`

```text
DESCRIPTION
  List repository notes

USAGE
  notes list [flags]

FLAGS
  --all              Show notes from every projects directory
  --tag string       Only include notes with this tag
  --format choice    Output format (choices: labels, json)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

EXAMPLES
  notes list
  notes list --all
  notes list --tag handoff
```

## `notes search`

```text
DESCRIPTION
  Search repository note metadata

USAGE
  notes search [flags]

FLAGS
  --query string     Fuzzy search text
  --all              Show notes from every projects directory
  --tag string       Only include notes with this tag
  --format choice    Output format (choices: labels, json)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

EXAMPLES
  notes search --query architecture --format labels
```

## `notes read`

```text
DESCRIPTION
  Print a note file

USAGE
  notes read [flags]

FLAGS
  --path path    Absolute path to a note file inside the notes vault
  --json         Emit content and revision hash as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes write`

```text
DESCRIPTION
  Write stdin to a note file, then commit and push it

USAGE
  notes write [flags]

FLAGS
  --path path               Absolute path to a note file inside the notes vault
  --stdin                   Read note content from stdin
  --expected-hash string    Fail if the existing note no longer has this SHA-256 hash
  --json                    Emit the complete mutation result as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes delete`

```text
DESCRIPTION
  Delete a note file, then commit and push it

USAGE
  notes delete [flags]

FLAGS
  --path path    Absolute path to a note file inside the notes vault
  --json         Emit the complete mutation result as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes move`

```text
DESCRIPTION
  Move a note to another known repository scope

USAGE
  notes move [flags]

FLAGS
  --path path    Absolute path to a note file inside the notes vault
  --to string    Existing or remembered repository scope
  --json         Emit the complete mutation result as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes create`

```text
DESCRIPTION
  Create a note from stdin, then commit and push it

USAGE
  notes create [flags]

FLAGS
  --repository string     Repository scope for the new note
  --kind choice           Note template kind (choices: note, handoff)
  --name string           Note name
  --description string    Note description
  --stdin                 Read the note body from stdin
  --json                  Emit the complete create result as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes targets`

```text
DESCRIPTION
  List known repository targets

USAGE
  notes targets [flags]

FLAGS
  --format choice    Output format (choices: labels, json)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes agents`

```text
DESCRIPTION
  List installed agent targets

USAGE
  notes agents [flags]

FLAGS
  --format choice    Output format (choices: labels, json)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes priority`

```text
DESCRIPTION
  Set a note priority, then commit and push it

USAGE
  notes priority [flags]

FLAGS
  --path path       Absolute path to a note file inside the notes vault
  --value choice    New priority (choices: low, medium, high, critical)
  --json            Emit the mutation result as JSON

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes open-agent`

```text
DESCRIPTION
  Open a note in an installed agent through Herdr

USAGE
  notes open-agent [flags]

FLAGS
  --path path       Absolute path to a note file inside the notes vault
  --agent string    Command from notes agents
  --json            Emit the opened workspace and tab IDs

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes handoffs`

```text
DESCRIPTION
  Browse handoff-tagged notes

USAGE
  notes handoffs [flags]

FLAGS
  --all              Show notes from every projects directory
  --list             List handoffs to stdout instead of opening the TUI
  --format choice    Output format (choices: labels, json)

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes mcp`

```text
DESCRIPTION
  Run the notes MCP server over stdio

USAGE
  notes mcp [flags]

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes capture`

```text
DESCRIPTION
  Process a captured note through local OpenCode

USAGE
  notes capture [flags]

FLAGS
  --config path          Daemon YAML configuration path
  --status               Check local processor availability
  --stdin                Read captured note text from stdin
  --repository string    Target repository (omit for Automatic)
  --json                 Emit a machine-readable result

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```

## `notes daemon`

```text
DESCRIPTION
  Process captured notes through local OpenCode

USAGE
  notes daemon [flags]

FLAGS
  --config path    Daemon YAML configuration path
  --once           Process one queue snapshot and exit

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)
```
