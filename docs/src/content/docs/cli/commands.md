---
title: Command Reference
description: Every notes command, flag and example, generated from the CLI registry.
sidebar:
  order: 2
---

<!-- Generated from src/cli/spec.ts by `mise run docs:gen:cli`. Do not edit by hand. -->

This page lists every `notes` command, generated from the same registry that powers `notes help`.

## `notes root`

Print the notes vault root

```text
notes root [--repo-notes]
```

**Options**

| Option         | Description                          |
| -------------- | ------------------------------------ |
| `--repo-notes` | Print the repository notes directory |

**Examples**

```bash
notes root
notes root --repo-notes
```

## `notes context`

Print repo-note context for integration plugins

```text
notes context --command <name> [--json]
```

Resolve the current repository, its notes directory, and relevant existing notes.
The --json form is intended for OpenCode plugins that render their own prompt context.

**Options**

| Option               | Description                                 |
| -------------------- | ------------------------------------------- |
| `--command` `<name>` | Integration command name requesting context |
| `--json`             | Emit structured context JSON                |

**Examples**

```bash
notes context --command notes-list
notes context --command note-reference --json
```

## `notes list`

List repository notes

```text
notes list [--all] [--tag <tag>] [--format labels|json]
```

**Options**

| Option                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `--all`                     | Show notes from every repo-notes directory |
| `--tag` `<tag>`             | Only include notes with this tag           |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`)   |

**Examples**

```bash
notes list
notes list --all
notes list --tag handoff
notes list --format json
```

## `notes read`

Print a note file

```text
notes read --path <path>
```

**Options**

| Option            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `--path` `<path>` | Absolute path to a note file inside the notes vault |

**Examples**

```bash
notes read --path ~/Documents/notes/repo-notes/owner/repo/topic.md
```

## `notes write`

Write stdin to a note file, then commit and push it

```text
notes write --path <path> --stdin [--json]
```

**Options**

| Option            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `--path` `<path>` | Absolute path to a note file inside the notes vault |
| `--stdin`         | Read note content from stdin                        |
| `--json`          | Emit the note output and push status as JSON        |

**Examples**

```bash
notes write --path ~/Documents/notes/repo-notes/owner/repo/topic.md --stdin
```

## `notes delete`

Delete a note file, then commit and push it

```text
notes delete --path <path> [--json]
```

**Options**

| Option            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `--path` `<path>` | Absolute path to a note file inside the notes vault |
| `--json`          | Emit the note output and push status as JSON        |

**Examples**

```bash
notes delete --path ~/Documents/notes/repo-notes/owner/repo/topic.md
```

## `notes handoffs`

List handoff-tagged notes

```text
notes handoffs [--all] [--format labels|json]
```

Handoffs are normal notes tagged handoff, with optional priority metadata.

**Options**

| Option                      | Description                                |
| --------------------------- | ------------------------------------------ |
| `--all`                     | Show notes from every repo-notes directory |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`)   |

**Examples**

```bash
notes handoffs
notes handoffs --all
notes handoff
```

## `notes mcp`

Run the notes MCP server over stdio

```text
notes mcp
```

Start a Model Context Protocol server exposing note read, list, write, and delete tools.

**Examples**

```bash
notes mcp
```

## `notes completions`

Generate shell completions

```text
notes completions [bash|fish|zsh]
```

Generate shell completions for notes.

**Arguments**

| Argument  | Description                    |
| --------- | ------------------------------ |
| `<shell>` | One of: `bash`, `fish`, `zsh`. |

**Examples**

```bash
notes completions zsh
notes completions bash
notes completions fish
```

## `notes help`

Show notes help

```text
notes help [command]
```

**Arguments**

| Argument    | Description                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `<command>` | Optional command to show help for. One of: `root`, `context`, `list`, `read`, `write`, `delete`, `handoffs`, `mcp`, `completions`. |

**Examples**

```bash
notes help
notes help list
```
