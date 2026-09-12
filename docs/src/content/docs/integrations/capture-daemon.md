---
title: Capture processor
description: Process queued or direct captures through the OpenCode CLI.
---

The notes daemon polls a private GitHub issue queue, claims each issue with a temporary processing label, runs its captured text through a standalone OpenCode command, and posts the result before closing the issue.

The same processor also accepts a capture directly, without the web app or GitHub queue:

```sh
printf 'Investigate this note' | notes capture \
  --config ~/.config/notes/daemon.yml \
  --stdin \
  --repository owner/repository \
  --json
```

Omit `--repository` to use Automatic repository resolution. Check whether the configured executable is available with `notes capture --config ~/.config/notes/daemon.yml --status --json`. This check does not start OpenCode or a model. The capture form validates the same version 1 text, timestamp, request ID, source, and optional repository fields as the web capture.

The [Notes Capture Omarchy plugin](/integrations/omarchy-capture/) uses this
direct mode through a host-owned wrapper. Direct captures do not need GitHub
CLI authentication or pass through the GitHub issue queue.

Run one pass while testing configuration:

```sh
notes daemon --config ~/.config/notes/daemon.yml --once
```

Omit `--once` for the supervised polling loop. Both modes use the same command configuration and model fallback chain.

```yaml
repository: owner/private-notes
queueLabel: agent:ready
workerId: desktop
workerActor: github-user
opencodeCommand: opencode2
opencodeArgs: []
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

`opencodeCommand` is an optional executable name or path, defaulting to `opencode2`. `opencodeArgs` is an optional argv prefix, defaulting to `[]`. Notes appends `run --standalone --format json --agent notes-daemon --model provider/model#variant --title ... -- prompt` and uses `opencodeDirectory` as the working directory. Arguments are passed literally without a shell; only a leading `~` in the executable path is expanded. A configured wrapper can supply isolated OpenCode configuration or additional process limits. Readiness checks only that executable, not its prefix arguments or model access.

The host owns the dedicated `notes-daemon` agent and its OpenCode configuration. Configure its read paths, tools, model credentials, and isolation before processing captures.

`opencodeModels` is an ordered fallback chain. Each model gets a fresh standalone OpenCode process. Notes reads final assistant text from stdout JSON events and keeps stderr separate. A model result must explicitly report success after writing the note; a reported failure, malformed result, command failure, or timeout advances to the next model. `sessionTimeoutSeconds` applies to each model attempt, so `passTimeoutSeconds` must leave enough time for every configured attempt and cleanup.

The dedicated agent fails closed for unknown tools. It allows built-in read/search operations, Exa search, authenticated read-only GitHub tools, and Notes MCP list/read/write. External filesystem reads are denied except for `allowedReadPaths`; write/edit/patch tools remain denied for every path. It also denies questions, delegation, planning mode, shell execution, browser control, Chrome DevTools, and note deletion. Any unexpected permission or question request aborts the job instead of waiting for input.

The agent must investigate before writing. Notes record the repository paths or primary sources inspected, evidence-based findings, and the requested output, such as an implementation plan. A capture cannot complete by merely paraphrasing its issue text; if the available read tools cannot support the investigation, the daemon leaves the issue open as failed.

A failed issue receives one bounded, sanitised error summary when the daemon has an actionable typed error. Unknown failures use a generic public message. Complete error objects remain in daemon logs rather than exposing stack traces, credentials, request bodies, or filesystem paths in GitHub comments.

OpenCode infers the target repository from the capture and writes under `projects/{owner}/{repo}`. Captures without a resolvable repository use `projects/local/captures`. Completion comments report the note commit SHA rather than exposing a local filesystem path.

Claim labels are ownership checked before GitHub mutations. The daemon does not automatically take over stale claims; remove an `agent:processing:*` label manually only after confirming its worker is no longer processing the issue.

Session, queue-pass, and external command timeouts are configured in daemon YAML. On timeout or cancellation, Notes terminates the child process group and allows ten seconds before forcing termination, leaving time for a configured wrapper to finish its own cleanup. Cancellation does not start a fallback. Persistent pass failures exit after the configured threshold so systemd can restart the daemon.
