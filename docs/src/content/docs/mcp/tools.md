---
title: MCP Tool Reference
description: Generated reference for the notes MCP tools.
sidebar:
  order: 2
---

<!-- Generated from src/mcp/toolMetadata.ts by `mise run docs:gen:mcp`. Do not edit by hand. -->

## `note_read`

Read the full content and SHA-256 revision of a note file from the notes vault.

CLI equivalent: `notes read --path <path>`

| Parameter | Type   | Default | CLI             | Description                                            |
| --------- | ------ | ------- | --------------- | ------------------------------------------------------ |
| `path`    | string |         | `--path <path>` | Absolute path to the note file inside the notes vault. |

## `note_list`

List note files in the notes vault for the current repository, optionally filtered by tag or grouped across all repositories.

CLI equivalent: `notes list [--all] [--tag <tag>] --format json`

| Parameter | Type    | Default | CLI           | Description                                                       |
| --------- | ------- | ------- | ------------- | ----------------------------------------------------------------- |
| `tag`     | string  |         | `--tag <tag>` | Optional tag to filter notes by, for example handoff.             |
| `all`     | boolean | false   | `--all`       | List notes from all repositories instead of just the current one. |

## `note_write`

Write a note file to the notes vault, then commit and best-effort push it.

CLI equivalent: `notes write --path <path> --stdin`

| Parameter      | Type   | Default | CLI                        | Description                                                               |
| -------------- | ------ | ------- | -------------------------- | ------------------------------------------------------------------------- |
| `path`         | string |         | `--path <path>`            | Absolute path to the note file to create or overwrite.                    |
| `content`      | string |         | `stdin`                    | Full file content to write, including frontmatter and body.               |
| `expectedHash` | string |         | `--expected-hash <sha256>` | Optional SHA-256 revision from note_read used to reject stale overwrites. |

## `note_delete`

Delete a note file from the notes vault, then commit and best-effort push it.

CLI equivalent: `notes delete --path <path>`

| Parameter | Type   | Default | CLI             | Description                               |
| --------- | ------ | ------- | --------------- | ----------------------------------------- |
| `path`    | string |         | `--path <path>` | Absolute path to the note file to delete. |
