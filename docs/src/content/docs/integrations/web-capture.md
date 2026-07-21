---
title: Web Capture
description: Capture typed or dictated text for local OpenCode processing.
---

The capture PWA creates private queue issues in a configured notes repository. Cloudflare Access restricts the application to configured identities, and the Worker validates the Access token before serving the application or accepting captures.

## Capture

Type into the capture field or use **Dictate** when the browser exposes speech recognition. Dictation is a progressive enhancement: support and processing location depend on the browser, and the transcript is always editable before submission.

Submitting creates an issue with the fixed `agent:ready` label. The issue records a request identifier, capture source, and timestamp for later local processing.

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

Copy `capture/.dev.vars.example` to `capture/.dev.vars` for local configuration. Production deployment configuration stays outside this public repository: configure the Worker custom domain, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, `GITHUB_OWNER`, `GITHUB_REPO`, and `QUEUE_LABEL` in Cloudflare, and store `GITHUB_TOKEN` as a Worker secret.

Use `capture/wrangler.example.jsonc` for public validation. Keep the production values in ignored `capture/wrangler.local.jsonc`; the deploy scripts select it only while generating the production Worker bundle.
