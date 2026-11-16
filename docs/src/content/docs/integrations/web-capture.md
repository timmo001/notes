---
title: Web Capture
description: Capture typed text for local OpenCode processing.
---

The capture PWA creates private queue issues in a configured notes repository. Cloudflare Access restricts the application to configured identities, and the Worker validates the Access token before serving the application or accepting captures.

## Capture

Type into the capture field and submit the note for local processing. You can use the phone's voice keyboard or desktop speech-to-text when needed.

When `CAPTURE_REPOSITORIES` is configured, the form also provides a searchable target repository picker and remembers the last valid explicit selection in browser storage. Its default **Automatic** option leaves the target unspecified so the daemon can infer it from the capture context, falling back to `projects/local/captures`. The value is a JSON array of `{ "label": "Display name", "repository": "owner/repo" }` records. The API validates every explicit selection against this server-owned list and records it as issue metadata. It never uses the target as the issue destination.

Submitting always creates an issue in the private queue repository configured by `GITHUB_OWNER/GITHUB_REPO`, with the fixed `agent:ready` label. The issue records the target repository, request identifier, typed capture source, and timestamp for later local processing.

## Install and updates

The page is an installable PWA: it offers an install banner until you turn it down once, and an Install button stays in the header. It can also receive shares: share text or a link to Capture from another app and it is added to the note, never replacing what is already written.

Each build has a version. The page sends it with every API call, and the Worker answers `426` to a page from another build. The page then reloads once onto the new build, keeping the note, or shows a banner asking for a reload if that didn't help.

## Development

The PWA is a separate application under `capture/` so the Starlight documentation deployment remains static and independent. A Lit form is built by Vite and served as static assets by a Cloudflare Worker, whose Effect `HttpRouter` handles the Access check and the `/api/repositories` and `/api/captures` routes. The Worker runs first for every request, so the page itself stays behind Cloudflare Access.

```bash
mise run capture:dev
mise run serve:capture
mise run serve:capture:status
mise run serve:capture:logs
mise run serve:capture:restart
mise run serve:capture:stop
mise run capture:check
mise run capture:build
```

`serve:capture` runs the Vite dev server through Pitchfork on port 7490, or the next free port, at `https://capture.notes.localhost` through the Pitchfork proxy.

Capture type-checking runs the Effect-patched TypeScript 7 compiler with plain `tsc`.

Local development bypasses Cloudflare Access and requires `GITHUB_TOKEN` in `capture/.dev.vars` to exercise issue creation. Never commit that file.

Copy `capture/.dev.vars.example` to `capture/.dev.vars` for local configuration. Production configuration stays outside this public repository.

## Deployment

[`capture/alchemy.run.ts`](https://github.com/timmo001/notes/blob/main/capture/alchemy.run.ts) is the Worker's [Alchemy](https://alchemy.run) stack: the `notes-capture` Worker, its custom domain, the Vite build's assets and the plain `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `GITHUB_OWNER`, `GITHUB_REPO`, `CAPTURE_REPOSITORIES` and `QUEUE_LABEL` vars. The Deploy capture workflow runs `mise run capture:deploy` on pushes to `main` that touch `capture/`. `GITHUB_TOKEN` is a Worker secret set in Cloudflare, outside the stack, and deploys leave it alone.

The stack reads the vars as `CAPTURE_*` names (`CAPTURE_GITHUB_REPO` for `GITHUB_REPO`, and so on). CI gets them from the repository's secrets and variables; locally they come from the ignored `capture/.env.prod`, not `.env`, which Wrangler would load as dev vars. `mise run docs:deploy:github` writes that file's values into the repository, so change a var there, deploy the github stack, then deploy capture. `mise run capture:plan` shows what a deploy would change.

`capture/wrangler.example.jsonc` only gives the Vite plugin and `wrangler types` the Worker's shape for development and the build.
