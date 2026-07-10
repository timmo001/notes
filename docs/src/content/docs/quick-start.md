---
title: Quick Start
description: Use the notes CLI and MCP server.
---

Install `notes` first, or build locally and substitute `./dist/notes` for `notes` in the examples below.

## Inspect the Vault

```bash
notes root
notes root --repo-notes
```

The vault defaults to `~/Documents/notes`. Set `NOTES` to use another Git-backed vault.

## List Notes

Run list commands from inside a Git repository so `notes` can resolve `owner/repo` from the remote URL.

```bash
notes list
notes list --format json
notes list --all
notes list --tag handoff
```

## Read and Write

```bash
notes read --path ~/Documents/notes/repo-notes/owner/repo/topic.md
notes write --path ~/Documents/notes/repo-notes/owner/repo/topic.md --stdin < topic.md
```

Writes validate and refresh frontmatter, create parent directories, commit the changed note, and best-effort push the vault when it has a remote. Use `notes read --json` and pass its `hash` back with `--expected-hash` when an overwrite must fail if another process changed the note.

## Handoffs

Handoffs are normal notes tagged `handoff`.

```bash
notes handoffs
notes handoffs --all
notes handoff
```

## MCP Server

Start the stdio server from an MCP client:

```bash
notes mcp
```

OpenCode exposes the tools with the server key prefix, for example `notes_note_read` and `notes_note_write` when the server is configured as `notes`.
