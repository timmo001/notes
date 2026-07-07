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

## Layout

Repository notes live under:

```text
{vault}/repo-notes/{owner}/{repo}/{slug}.md
```

The `{owner}/{repo}` segment is resolved from the current Git repository's remote URL. `notes` prefers `upstream`, then `origin`, then the first remote.

## Frontmatter

Notes are ordinary Markdown files. The CLI reads these fields from YAML frontmatter when present:

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

`name`, `description`, `tags`, and `priority` are used for listings. Writes refresh the `date:` line automatically.

## Safety

Read, write, and delete operations are restricted to the notes vault. Paths are expanded, resolved, and checked before file I/O.

Writes and deletes are committed to the vault Git repo. If the vault has a remote, `notes` attempts a best-effort push. Push failures are reported but do not fail the note operation.

## Listing

```bash
notes list
notes list --format json
notes list --all
notes list --tag research
```

The JSON form returns structured note metadata for scripts and plugins.
