---
name: notes-cli
description: Use the notes CLI to find, read, create, update, and delete repository notes. Use for shell-based note workflows, notes commands, and handoff storage. For Notes MCP tool calls, use notes-mcp instead.
compatibility: Requires the notes CLI, shell access, and a configured notes vault. The CLI owns note paths, revision checks, timestamps, and Git persistence.
license: Apache-2.0
---

# Notes CLI

Use the `notes` CLI for vault access. Run it from the target repository so context and listings resolve the right scope. Check a subcommand's `--help` when its flags are uncertain.

Use the CLI when a note command, skill, or explicit user request calls for a note operation. Tool availability alone does not authorise note mutations.

## Workflow

1. Resolve the absolute note directory from injected repository-note context or `notes context --command <command> --json`. The `--command` flag is required; use the active note command, or `notes-list` for discovery. Use the returned `notesPath`, including a resolved local scope, rather than constructing a vault path from owner and repository names. If no usable note path is returned, report that failure before writing.
2. Find notes with `notes list --format json`, optionally filtered by `--tag`. Use `--all` only for an explicit cross-repository request.
3. Read a selected note with `notes read --path "<absolute-path>" --json`. Keep both its full content and revision hash for an update.
4. Create or replace a note by passing its complete Markdown content on stdin to `notes write --path "<absolute-path>" --stdin --json`:
   - For creation, verify the target is unused. `write` is not create-only; stop rather than overwrite an uncertain target. Include valid YAML frontmatter and body, and let the CLI set the date.
   - For updates, preserve unrelated frontmatter and content, and add `--expected-hash "<revision-from-read>"`. On a stale revision, read again and reconcile before retrying. Never omit the hash to bypass a conflict.
5. Before deletion, name the note and obtain explicit confirmation. Then run `notes delete --path "<absolute-path>" --json`.
6. Report the returned mutation result. The CLI handles timestamps, Git commits, and pushes; a local save can succeed while persistence to Git or the remote fails. Surface partial failures instead of repeating the mutation blindly.

Trust a successful JSON result. Do not read the note back or run separate date, commit, status, or push commands just to confirm it. Use CLI operations rather than direct filesystem access to the vault.
