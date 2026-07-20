---
title: Notes
description: Vault layout, repository identity, and note safety rules.
sidebar:
  order: 1
---

`notes` stores Markdown files in a Git-backed vault and opens an interactive browser when run without a command. The default vault is `~/Documents/notes`; set `NOTES` to use a different path. `DOT_NOTES_DIR` is still read as a compatibility fallback when `NOTES` is unset.

## Browse

```bash
notes
notes --all
```

The TUI uses a two-pane layout: the left pane lists notes, and the right pane previews the selected note's metadata and Markdown body. Useful controls:

| Key                 | Action                              |
| ------------------- | ----------------------------------- |
| `up` / `down`       | Move through notes                  |
| `Tab`               | Switch between list and preview     |
| `/`                 | Search note names, tags and summary |
| `s`                 | Cycle sorting                       |
| `v`                 | Toggle current repo/all repos       |
| `a` / `A`           | Create a note in editor/visual      |
| `e` / `E`           | Edit in editor/visual               |
| `o` / `O`           | Open in OpenCode/default plan mode  |
| `d`                 | Delete after confirmation           |
| `r`                 | Refresh                             |
| `Esc` / `Backspace` | Exit or go back                     |

Editor commands must stay attached until editing finishes. Set `EDITOR` for terminal editing and use a waiting visual command such as `VISUAL="code --wait"` for `A` and `E`.

## Layout

Repository notes live under:

```text
{vault}/projects/{owner}/{repo}/{slug}.md
```

The `{owner}/{repo}` segment is resolved from the current Git repository's remote URL. `notes` prefers `upstream`, then `origin`, then the first remote. When no usable remote exists, notes use `projects/local/{project}`. The project name comes from the Git worktree root, or from the current directory outside Git.

## Frontmatter

Notes are ordinary Markdown files with YAML frontmatter:

```yaml
---
repo: owner/repo
date: 2026-07-06T12:00:00+01:00
name: Useful Note
description: One-line summary.
tags: [research, handoff]
priority: medium
---
```

`name`, `description`, `tags`, and `priority` are used for listings. Writes validate the frontmatter and refresh `date:` automatically.

## Safety

Read, write, and delete operations are restricted to physical Markdown files under `projects/{owner}/{repo}`. Symlinks, special files, malformed project identities, and paths elsewhere in the vault are rejected. Writes use atomic replacement, and draft creation never overwrites an existing filename.

Before a mutation, `notes` refuses an existing staged index and rebases safely onto the configured upstream. Mutations are serialized across processes, committed to the vault Git repo, and then pushed when a remote exists. Editor sessions hold the same transaction lock until the resulting note is validated and committed. A commit or push failure is reported as partial success because the local file change has already completed.

`notes read --json` and MCP `note_read` return a SHA-256 revision. Pass it to `notes write --expected-hash` or MCP `note_write.expectedHash` to reject a stale overwrite.

## Listing

```bash
notes list
notes list --format json
notes list --all
notes list --tag research
```

The JSON form returns structured note metadata for scripts and plugins.
