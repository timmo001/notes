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
notes root [--projects]
```

**Options**

| Option       | Description                  |
| ------------ | ---------------------------- |
| `--projects` | Print the projects directory |

**Examples**

```bash
notes root
notes root --projects
```

## `notes context`

Print project-note context for integration plugins

```text
notes context --command <name> [--json]
```

Resolve the current project, its notes directory, and relevant existing notes.
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

| Option                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `--all`                     | Show notes from every projects directory |
| `--tag` `<tag>`             | Only include notes with this tag         |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`) |

**Examples**

```bash
notes list
notes list --all
notes list --tag handoff
notes list --format json
```

## `notes search`

Search repository note metadata

```text
notes search --query <text> [--all] [--tag <tag>] --format labels|json
```

**Options**

| Option                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `--query` `<text>`          | Fuzzy search text                        |
| `--all`                     | Show notes from every projects directory |
| `--tag` `<tag>`             | Only include notes with this tag         |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`) |

**Examples**

```bash
notes search --query architecture --format labels
notes search --query handoff --all --format json
```

## `notes read`

Print a note file

```text
notes read --path <path> [--json]
```

**Options**

| Option            | Description                                         |
| ----------------- | --------------------------------------------------- |
| `--path` `<path>` | Absolute path to a note file inside the notes vault |
| `--json`          | Emit content and revision hash as JSON              |

**Examples**

```bash
notes read --path ~/Documents/notes/projects/owner/repo/topic.md
```

## `notes write`

Write stdin to a note file, then commit and push it

```text
notes write --path <path> --stdin [--expected-hash <sha256>] [--json]
```

**Options**

| Option                       | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `--path` `<path>`            | Absolute path to a note file inside the notes vault       |
| `--stdin`                    | Read note content from stdin                              |
| `--expected-hash` `<sha256>` | Fail if the existing note no longer has this SHA-256 hash |
| `--json`                     | Emit the complete mutation result as JSON                 |

**Examples**

```bash
notes write --path ~/Documents/notes/projects/owner/repo/topic.md --stdin
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
| `--json`          | Emit the complete mutation result as JSON           |

**Examples**

```bash
notes delete --path ~/Documents/notes/projects/owner/repo/topic.md
```

## `notes move`

Move a note to another known repository scope

```text
notes move --path <path> --to <owner/repo> [--json]
```

**Options**

| Option                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `--path` `<path>`     | Absolute path to a note file inside the notes vault |
| `--to` `<owner/repo>` | Existing or remembered repository scope             |
| `--json`              | Emit the complete mutation result as JSON           |

**Examples**

```bash
notes move --path ~/Documents/notes/projects/local/captures/topic.md --to local/aidan
```

## `notes create`

Create a note from stdin, then commit and push it

```text
notes create --repository <owner/repo> --kind <note|handoff> --name <name> --description <description> --stdin [--json]
```

**Options**

| Option                          | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `--repository` `<owner/repo>`   | Repository scope for the new note              |
| `--kind` `<note\|handoff>`      | Note template kind (one of: `note`, `handoff`) |
| `--name` `<name>`               | Note name                                      |
| `--description` `<description>` | Note description                               |
| `--stdin`                       | Read the note body from stdin                  |
| `--json`                        | Emit the complete create result as JSON        |

**Examples**

```bash
printf '# Follow-up' | notes create --repository owner/repo --kind note --name Follow-up --description 'Next steps' --stdin
```

## `notes targets`

List known repository targets

```text
notes targets --format labels|json
```

**Options**

| Option                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`) |

**Examples**

```bash
notes targets --format labels
notes targets --format json
```

## `notes agents`

List installed agent targets

```text
notes agents --format labels|json
```

**Options**

| Option                      | Description                              |
| --------------------------- | ---------------------------------------- |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`) |

**Examples**

```bash
notes agents --format labels
notes agents --format json
```

## `notes priority`

Set a note priority, then commit and push it

```text
notes priority --path <path> --value <low|medium|high|critical> [--json]
```

**Options**

| Option                                    | Description                                                |
| ----------------------------------------- | ---------------------------------------------------------- |
| `--path` `<path>`                         | Absolute path to a note file inside the notes vault        |
| `--value` `<low\|medium\|high\|critical>` | New priority (one of: `low`, `medium`, `high`, `critical`) |
| `--json`                                  | Emit the mutation result as JSON                           |

**Examples**

```bash
notes priority --path ~/Documents/notes/projects/owner/repo/topic.md --value high
```

## `notes open-agent`

Open a note in an installed agent through Herdr

```text
notes open-agent --path <path> --agent <command> --json
```

**Options**

| Option                | Description                                         |
| --------------------- | --------------------------------------------------- |
| `--path` `<path>`     | Absolute path to a note file inside the notes vault |
| `--agent` `<command>` | Command from notes agents                           |
| `--json`              | Emit the opened workspace and tab IDs               |

**Examples**

```bash
notes open-agent --path ~/Documents/notes/projects/owner/repo/topic.md --agent opencode2 --json
```

## `notes handoffs`

Browse handoff-tagged notes

```text
notes handoffs [--all] [--list] [--format labels|json]
```

Handoffs are normal notes tagged handoff. Priority metadata is shared with notes.
With no flags this opens the interactive notes TUI filtered to handoffs.

**Options**

| Option                      | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `--all`                     | Show notes from every projects directory           |
| `--list`                    | List handoffs to stdout instead of opening the TUI |
| `--format` `<labels\|json>` | Output format (one of: `labels`, `json`)           |

**Examples**

```bash
notes handoffs
notes handoffs --all
notes handoffs --list
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

## `notes capture`

Process a captured note through local OpenCode

```text
notes capture --config <path> (--status | --stdin [--repository <owner/repo>]) [--json]
```

**Options**

| Option                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `--config` `<path>`           | Daemon YAML configuration path         |
| `--status`                    | Check local processor availability     |
| `--stdin`                     | Read captured note text from stdin     |
| `--repository` `<owner/repo>` | Target repository (omit for Automatic) |
| `--json`                      | Emit a machine-readable result         |

**Examples**

```bash
notes capture --config ~/.config/notes/daemon.yml --status --json
printf 'Investigate this' | notes capture --config ~/.config/notes/daemon.yml --stdin --json
```

## `notes daemon`

Process captured notes through local OpenCode

```text
notes daemon --config <path> [--once]
```

Poll a configured GitHub issue queue, claim work through custom Git refs, and post local OpenCode results.
The OpenCode server password is read from OPENCODE_SERVER_PASSWORD.

**Options**

| Option              | Description                         |
| ------------------- | ----------------------------------- |
| `--config` `<path>` | Daemon YAML configuration path      |
| `--once`            | Process one queue snapshot and exit |

**Examples**

```bash
notes daemon --config ~/.config/notes/daemon.yml
notes daemon --config ~/.config/notes/daemon.yml --once
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

| Argument    | Description                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<command>` | Optional command to show help for. One of: `root`, `context`, `list`, `search`, `read`, `write`, `delete`, `move`, `create`, `targets`, `agents`, `priority`, `open-agent`, `handoffs`, `mcp`, `capture`, `daemon`, `completions`. |

**Examples**

```bash
notes help
notes help list
```
