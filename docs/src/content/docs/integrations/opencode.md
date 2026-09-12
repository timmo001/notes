---
title: OpenCode
description: How OpenCode integrations consume notes.
sidebar:
  order: 1
---

`notes` owns the standalone CLI, MCP server, and portable [`notes-cli`](https://github.com/timmo001/notes/tree/main/.agents/skills/notes-cli) and [`notes-mcp`](https://github.com/timmo001/notes/tree/main/.agents/skills/notes-mcp) Agent Skills. OpenCode plugins, slash commands, guards, and integration-specific skills are maintained outside this repo because they are part of the agent configuration layer.

The dotfiles OpenCode plugin consumes structured context from:

```bash
notes context --command notes-list --json
```

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

Import the skill for the transport agents should use: `notes-cli` for shell commands or `notes-mcp` for MCP tools. Plugin source and workflow prompts remain in dotfiles/OpenCode config.
