# notes agents

This repo contains the standalone `notes` CLI and MCP server.

## Stack

- Runtime and package manager: Bun.
- Language: TypeScript.
- Effects and services: Effect v4.
- Docs: Astro + Starlight under `docs/`.
- Task runner: mise.

## Rules

- Keep code at the repo root under `src/`.
- Keep CLI metadata in `src/cli/spec.ts`; help, completions, and generated docs consume it.
- Regenerate generated docs with `mise run docs:gen` after changing CLI or MCP metadata.
- Do not hand-edit generated docs pages.
- Keep portable Notes skills under `.agents/skills/`. Keep OpenCode plugins, commands, guards, and integration-specific skills in dotfiles/opencode-config.

## Docs Dev Server

- Use `mise run docs:dev:serve` to start the Astro docs dev server in background mode.
- Use `mise run docs:dev:status`, `mise run docs:dev:logs`, and `mise run docs:dev:stop` to inspect or stop it.
- Use `mise run docs:dev` only when foreground server output is explicitly needed.

## Validation

Run these after source changes:

```bash
mise run check
mise run build
mise run docs:gen
mise run docs:build
```

CI validates `.agents/skills/` with the shared `lint-agent-skills` workflow.
