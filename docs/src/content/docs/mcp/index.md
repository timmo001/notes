---
title: MCP Server
description: Run notes as a Model Context Protocol server over stdio.
sidebar:
  order: 1
---

`notes mcp` starts a Model Context Protocol server over stdio. It speaks JSON-RPC on stdout and sends logging to stderr so the protocol stream stays clean.

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

The server exposes note tools for reading, listing, writing, and deleting vault files. Reads include a SHA-256 revision that writes can use to reject stale content. See the generated [MCP tool reference](/mcp/tools/) for tool parameters.

## Tools

Agent harnesses prefix tool names with the server key. With the server configured as `notes`, `note_read` appears as `notes_note_read`.

## Resources

- `notes://context` - repo-note context for the current repository.
- `notes://command/{name}` - help text for a notes command.

Resources are a progressive enhancement; tools are the primary interface.
