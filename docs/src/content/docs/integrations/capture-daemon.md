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
queueLabel: agent:ready
workerId: desktop
workerActor: github-user
opencodeUrl: http://127.0.0.1:4097
opencodeDirectory: ~/.config/dotfiles
opencodeAgent: notes-daemon
opencodeModels:
  - providerID: github-copilot
    modelID: gpt-5.6-sol
    variant: low
  - providerID: github-copilot
    modelID: claude-opus-4.8
    variant: low
allowedReadPaths:
  - ~/repos/**
  - ~/.config/dotfiles/**
  - ~/.config/bootstrap/**
  - ~/.config/waybar/**
  - ~/.config/uwsm/**
sessionTimeoutSeconds: 300
passTimeoutSeconds: 900
commandTimeoutSeconds: 30
consecutiveFailureLimit: 3
pollIntervalSeconds: 30
```

The GitHub CLI must be authenticated with issue and repository write access. Each daemon process claims an issue with a visible `agent:processing:<workerId>:<id>` label and deletes that temporary label when processing finishes. A process proceeds only while its label is the sole processing label on the issue.

The daemon uses a separate loopback-only OpenCode server on port 4097. Its configuration and `notes-daemon` agent live under `.opencode-daemon/` in this repository rather than the interactive global OpenCode configuration. Its XDG config, data, state, and cache directories are isolated from interactive OpenCode sessions. The server runs in pure mode with external skills, project config, and default plugins disabled. Only the read-only GitHub MCP endpoint and Notes MCP server are configured.

`opencodeModels` is an ordered fallback chain. Each model gets a fresh session and the daemon aborts and deletes a failed session before trying the next entry. A model result must explicitly report success after writing the note; a reported failure or malformed result also advances to the next model. `sessionTimeoutSeconds` applies to each model attempt, so `passTimeoutSeconds` must leave enough time for every configured attempt and cleanup.

The dedicated agent fails closed for unknown tools. It allows built-in read/search operations, authenticated read-only GitHub tools, and Notes MCP list/read/write. External filesystem reads are denied except for `allowedReadPaths`; write/edit/patch tools remain denied for every path. It also denies questions, delegation, planning mode, shell execution, browser control, Chrome DevTools, and note deletion. Any unexpected permission or question request aborts the job instead of waiting for input.

The agent must investigate before writing. Notes record the repository paths or primary sources inspected, evidence-based findings, and the requested output, such as an implementation plan. A capture cannot complete by merely paraphrasing its issue text; if the available read tools cannot support the investigation, the daemon leaves the issue open as failed.

OpenCode infers the target repository from the capture and writes under `projects/{owner}/{repo}`. Captures without a resolvable repository use `projects/local/captures`. Completion comments report the note commit SHA rather than exposing a local filesystem path.

Claim labels are ownership checked before GitHub mutations. The daemon does not automatically take over stale claims; remove an `agent:processing:*` label manually only after confirming its worker is no longer processing the issue.

Session, queue-pass, and external command timeouts are configured in daemon YAML. OpenCode sessions are aborted and deleted on success, failure, timeout, or interruption. Persistent pass failures exit after the configured threshold so systemd can restart the daemon.
