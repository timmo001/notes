---
title: Capture daemon
description: Process queued web captures through a local OpenCode server.
---

The notes daemon polls a private GitHub issue queue, atomically claims each issue through a custom Git ref, submits its captured text to a local password-protected OpenCode server, and posts the result before closing the issue.

Run one pass while testing configuration:

```sh
notes daemon --config ~/.config/notes/daemon.yml --once
```

Omit `--once` for the supervised polling loop. Set `OPENCODE_SERVER_PASSWORD` in the service environment. `OPENCODE_SERVER_USERNAME` is optional and defaults to `opencode`.

```yaml
repository: owner/private-notes
repositoryPath: ~/Documents/notes
queueLabel: agent:ready
workerId: desktop
workerActor: github-user
opencodeUrl: http://127.0.0.1:4096
opencodeDirectory: ~/.config/dotfiles
pollIntervalSeconds: 30
```

`repositoryPath` must be a local checkout of `repository` with an `origin` remote that can create and delete `refs/daemon-locks/issues/*`. The GitHub CLI must be authenticated with issue and repository write access.

The daemon creates an OpenCode session rooted at `opencodeDirectory`. It denies tools by default and enables only read-only research plus Notes MCP note operations, then sends note text as base64-encoded untrusted data. Plain HTTP OpenCode URLs are accepted only for loopback hosts; use HTTPS for remote servers.

OpenCode infers the target repository from the capture and writes under `projects/{owner}/{repo}`. Captures without a resolvable repository use `projects/local/captures`. Completion comments report the note commit SHA rather than exposing a local filesystem path.

Lock refs are ownership checked before GitHub mutations and deleted with an expected-OID lease. The first release does not automatically take over stale locks. Remove one manually only after confirming its owner is no longer processing the issue.
