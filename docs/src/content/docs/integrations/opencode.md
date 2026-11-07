---
title: OpenCode
description: How OpenCode integrations consume notes.
sidebar:
  order: 1
---

`notes` owns the standalone CLI, MCP server, OpenCode plugin, and portable [`notes-cli`](https://github.com/timmo001/notes/tree/main/.agents/skills/notes-cli) and [`notes-mcp`](https://github.com/timmo001/notes/tree/main/.agents/skills/notes-mcp) Agent Skills. Slash commands, guards, and integration-specific skills are maintained outside this repo because they are part of the agent configuration layer.

## Plugin

The OpenCode plugin in `opencode-plugin/` adds a `notes` Code Mode namespace, so an agent can list, search, read, create and change the session repository's notes and handoffs in one script. Load it from the repository:

```json
{
  "plugins": ["github:timmo001/notes#main::path:opencode-plugin"]
}
```

It reads its tools from `notes agent tools --json` and runs each with `notes agent call` in the session's directory, so they always match the `notes` on your `PATH`. Tools that change notes, such as `write`, `create` and `move`, ask first, and commit and push like the CLI.

## Context

Integrations can read structured context from:

```bash
notes context --command notes-list --json
```

## MCP

The MCP server is configured with the `notes` key:

```json
{
  "mcp": {
    "notes": {
      "type": "local",
      "command": ["notes", "mcp"],
      "enabled": true
    }
  }
}
```

With that key, raw MCP tools such as `note_read` and `note_write` are exposed to OpenCode as `notes_note_read` and `notes_note_write`.

Import the skill for the transport agents should use: `notes-cli` for shell commands or `notes-mcp` for MCP tools.
