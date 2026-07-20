---
title: OpenCode
description: How OpenCode integrations consume notes.
sidebar:
  order: 1
---

`notes` owns the standalone CLI, MCP server, and portable [`notes-mcp` Agent Skill](https://github.com/timmo001/notes/tree/main/.agents/skills/notes-mcp). OpenCode plugins, slash commands, guards, and integration-specific skills are maintained outside this repo because they are part of the agent configuration layer.

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

Import the portable skill into your global or project skill directory when agents should use the MCP tools directly. Plugin source and workflow prompts remain in dotfiles/OpenCode config.
