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

Successful writes and deletes send a desktop notification when `notify-send` is
available. Notifications are best-effort, so the operation still succeeds when
`notify-send` is missing or cannot reach a notification service.

## Tools

Agent harnesses prefix tool names with the server key. With the server configured as `notes`, `note_read` appears as `notes_note_read`.

## Results and Code Mode

Each tool declares an `outputSchema` and returns its result as `structuredContent`, alongside the same text content as before. Clients that type results from the schema, such as OpenCode's Code Mode, can chain calls without parsing text:

```js
const { notes = [] } = await tools["notes"].note_list({ tag: "handoff" });
const note = await tools["notes"].note_read({ path: notes[0].filePath });

await tools["notes"].note_write({
  path: note.path,
  content: `${note.content}\n- Picked up\n`,
  expectedHash: note.hash,
});
```

`note_list` returns `{ notes }` for the current project, or `{ sections }` grouped by project when `all` is set. `note_write` and `note_delete` return the path, the Git commit and push outcome, and the rendered `output`; `note_write` also returns the new `hash`.

## Resources

- `notes://context` - repo-note context for the current repository.
- `notes://command/{name}` - help text for a notes command.

Resources are a progressive enhancement; tools are the primary interface.
