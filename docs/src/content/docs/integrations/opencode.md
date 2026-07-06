---
title: OpenCode
description: How OpenCode integrations consume notes.
sidebar:
  order: 1
---

`notes` owns the standalone CLI and MCP server. OpenCode plugins, slash commands, and skills are maintained outside this repo because they are part of the agent configuration layer.

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

Plugin source and workflow prompts live in dotfiles/OpenCode config. This repo documents only the CLI and MCP contracts those integrations consume.
