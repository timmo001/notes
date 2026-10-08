---
title: Web Capture
description: Capture typed text for local OpenCode processing.
---

The capture PWA creates private queue issues in a configured notes repository. Cloudflare Access restricts the application to configured identities, and the Worker validates the Access token before serving the application or accepting captures.

## Capture

Type into the capture field and submit the note for local processing. You can use the phone's voice keyboard or desktop speech-to-text when needed.

When `CAPTURE_REPOSITORIES` is configured, the form also provides a searchable target repository picker and remembers the last valid explicit selection in browser storage. Its default **Automatic** option leaves the target unspecified so the daemon can infer it from the capture context, falling back to `projects/local/captures`. The value is a JSON array of `{ "label": "Display name", "repository": "owner/repo" }` records. The API validates every explicit selection against this server-owned list and records it as issue metadata. It never uses the target as the issue destination.

Submitting always creates an issue in the private queue repository configured by `GITHUB_OWNER/GITHUB_REPO`, with the fixed `agent:ready` label. The issue records the target repository, request identifier, typed capture source, and timestamp for later local processing.

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

Copy `capture/.dev.vars.example` to `capture/.dev.vars` for local configuration. Production deployment configuration stays outside this public repository: configure the Worker custom domain, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `GITHUB_OWNER`, `GITHUB_REPO`, optional `CAPTURE_REPOSITORIES`, and `QUEUE_LABEL` in Cloudflare, and store `GITHUB_TOKEN` as a Worker secret.

Use `capture/wrangler.example.jsonc` for public validation. Keep the production values in ignored `capture/wrangler.local.jsonc`; the deploy scripts select it only while building the production Worker, and `wrangler deploy` then picks up the built configuration.

`dot notes-capture-sync` reconciles that local file from the active Worker's non-secret settings, generates picker options from notification-watched repositories, and deploys when the live picker differs. The generated configuration uses `keep_vars`, so Workers Builds triggered by later Git pushes preserve the runtime picker variable and dashboard-managed secrets.
