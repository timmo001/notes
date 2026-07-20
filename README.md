# 🗒️ Notes

Standalone CLI and MCP server for repo-scoped Markdown notes.

`notes` gives humans and agents one implementation for repository notes,
handoff-tagged notes, safe note reads/writes, and an MCP server for agent
harnesses.

Full setup, CLI reference, MCP usage, and integration docs are published at <https://notes.timmo.dev>.

Agents can use the portable [`notes-mcp` skill](.agents/skills/notes-mcp/SKILL.md) for safe MCP note workflows.

On Arch, install `repo-notes-git` from the AUR. For local development, run `mise run install` and `mise run build`, then use `dist/notes`.
