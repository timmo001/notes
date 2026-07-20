# 🗒️ Notes

Standalone CLI and MCP server for repo-scoped Markdown notes.

`notes` gives humans and agents one implementation for repository notes,
handoff-tagged notes, safe note reads/writes, and an MCP server for agent
harnesses.

Full setup, CLI reference, MCP usage, and integration docs are published at <https://notes.timmo.dev>.

Agents can use the portable [`notes-mcp` skill](.agents/skills/notes-mcp/SKILL.md) for safe MCP note workflows.

Stable releases use a manually chosen `YYYYMMDD.N` version. Create a blank
GitHub draft, optionally generate its release notes, then publish it to build
Linux archives, deb and RPM packages, and update `repo-notes-bin` in the AUR.
`repo-notes-git` continues to track relevant changes on `main`.

For local development, run `mise run install` and `mise run build`, then use
`dist/notes`.
