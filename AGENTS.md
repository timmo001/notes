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
- Keep CLI definitions and metadata in the Effect `Command` tree in `src/index.ts`; help, completions, and generated docs consume it.
- Regenerate generated docs with `mise run docs:gen` after changing CLI or MCP metadata.
- Do not hand-edit generated docs pages.
- Keep portable Notes skills under `.agents/skills/`, with separate `notes-cli` and `notes-mcp` workflows. Keep OpenCode plugins, commands, guards, and integration-specific skills in dotfiles/opencode-config.
- Repository notes live under `projects/{owner}/{repo}`. When no repository can be resolved, use the local scope under `projects/local/{project}`; automated captures use `projects/local/captures`.

## Omarchy Plugin

- `omarchy-plugin/` is the source of truth for the Notes Omarchy plugin. Edit it here, not in the published `timmo001/omarchy-notes` checkout, a dotfiles submodule, or the live plugin directory.
- Pushing plugin changes to Notes `main` runs `.github/workflows/publish-omarchy-plugin.yml`, which validates and publishes `omarchy-plugin/` to `timmo001/omarchy-notes`. Do not push to the published repository directly.
- Validate plugin changes with `omarchy plugin validate .` and the QML lint command in `omarchy-plugin/README.md`, run from `omarchy-plugin/`.

## Skill Ownership And Updates

- This repository owns `.agents/skills/notes-cli/SKILL.md` and `.agents/skills/notes-mcp/SKILL.md`.
- `timmo001/skills` imports only `notes-cli` as an unchanged snapshot. Edit the source here, not the imported or installed copy. `notes-mcp` remains available from this repository for explicit MCP use.
- Update order: `notes` source -> `skills` import -> skills `main` -> `dot update`.
- After an authorised source commit and push, run `./dist/skill-maintenance import notes-cli --apply` in the skills checkout. Review and validate the imported snapshot and its `imports.json` revision before committing and pushing skills.
- Then run `dot update`, which fetches the latest skills `main` and installs the new snapshot. Each commit or push still requires user authorisation.

## Background Dev Servers

- Start the capture PWA dev server with `mise run serve:capture` and the docs dev server with `mise run serve:docs`. Both run through Pitchfork in the background and restart if they exit or stop responding. Do not run `mise run capture:dev`, `mise run docs:dev`, `vite dev` or `astro dev` in the foreground from an agent.
- Use the `:status`, `:logs`, `:restart` and `:stop` variants of each, such as `mise run serve:docs:logs`, to manage them.
- The daemons are configured in `pitchfork.toml`. Capture serves `http://127.0.0.1:7490/` and docs `http://127.0.0.1:7470/`, or the next free port, and they are always at `https://capture.notes.localhost` and `https://docs.notes.localhost` through the Pitchfork proxy.
- Test through those HTTPS addresses, in the browser, with curl and anywhere else. Never add the proxy's own port, such as `:8443`, even if Pitchfork prints one: that means the 443 redirect is missing (it's lost on reboot), so run `pitchfork proxy doctor`, then `pitchfork proxy setup -y` to restore it. Use the `127.0.0.1` port only when the proxy isn't running.

## Validation

Run these after source changes:

```bash
mise run docs:gen
mise run check ::: build ::: docs:build
```

CI validates `.agents/skills/` with the shared `lint-agent-skills` workflow.
