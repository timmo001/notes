---
title: Web Capture
description: Capture typed or dictated text for local OpenCode processing.
---

The capture PWA creates private queue issues in a configured notes repository. Cloudflare Access restricts the application to configured identities, and the Worker validates the Access token before serving the application or accepting captures.

## Capture

Type into the capture field or use **Dictate** when the browser exposes speech recognition. Dictation is a progressive enhancement: support and processing location depend on the browser, and the transcript is always editable before submission.

When `CAPTURE_REPOSITORIES` is configured, the form also provides a searchable target repository picker and remembers the last valid explicit selection in browser storage. Its default **Automatic** option leaves the target unspecified so the daemon can infer it from the capture context, falling back to `projects/local/captures`. The value is a JSON array of `{ "label": "Display name", "repository": "owner/repo" }` records. The API validates every explicit selection against this server-owned list and records it as issue metadata. It never uses the target as the issue destination.

Submitting always creates an issue in the private queue repository configured by `GITHUB_OWNER/GITHUB_REPO`, with the fixed `agent:ready` label. The issue records the target repository, request identifier, capture source, and timestamp for later local processing.

## Development

The PWA is a separate Astro application under `capture/` so the Starlight documentation deployment remains static and independent.

```bash
mise run capture:dev
mise run capture:dev:serve
mise run capture:dev:status
mise run capture:dev:logs
mise run capture:dev:stop
mise run capture:check
mise run capture:build
```

Local development bypasses Cloudflare Access and requires `GITHUB_TOKEN` in `capture/.dev.vars` to exercise issue creation. Never commit that file.

Copy `capture/.dev.vars.example` to `capture/.dev.vars` for local configuration. Production deployment configuration stays outside this public repository: configure the Worker custom domain, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `GITHUB_OWNER`, `GITHUB_REPO`, optional `CAPTURE_REPOSITORIES`, and `QUEUE_LABEL` in Cloudflare, and store `GITHUB_TOKEN` as a Worker secret.

Use `capture/wrangler.example.jsonc` for public validation. Keep the production values in ignored `capture/wrangler.local.jsonc`; the deploy scripts select it only while generating the production Worker bundle.

`dot notes-capture-sync` reconciles that local file from the active Worker's non-secret settings, generates picker options from notification-watched repositories, and deploys when the live picker differs. The generated configuration uses `keep_vars`, so Workers Builds triggered by later Git pushes preserve the runtime picker variable and dashboard-managed secrets.
