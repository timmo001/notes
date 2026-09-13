---
title: Capture processor
description: Process queued or direct captures through the OpenCode CLI.
---

The notes daemon polls a private GitHub issue queue, claims each issue with a temporary processing label, runs its captured text through the OpenCode V2 CLI, and posts the result before closing the issue.

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

`opencodeCommand` is an optional executable name or path, defaulting to `opencode2`. `opencodeArgs` is an optional argv prefix, defaulting to `[]`. Notes uses that launcher and prefix for setup and `run --server <address> --session <verified-id> --format json --agent notes-daemon --model provider/model#variant --title ... -- prompt`, with `opencodeDirectory` as the working directory. Arguments are passed literally without a shell; only a leading `~` in the executable path is expanded. Readiness checks only that executable, not its prefix arguments or model access.

Before each model attempt, Notes checks `service status` and requires the default OpenCode V2 server to be running. All subsequent CLI commands pin that address with `--server`. Notes obtains the existing password with `service get password` and passes it through `OPENCODE_PASSWORD`, keeping it redacted in the Effect workflow and out of command arguments. No standalone server, SDK or direct HTTP client is used.

Setup uses the CLI's `api` subcommand: wait for plugin activation at the configured location, resolve the capture agent, create a session with explicit permissions, then read it back through a separate CLI process. Both responses must retain the requested agent, location and exact ordered permissions, and the read-back ID must match. Missing or changed policy fails the attempt before any prompt. Every fallback repeats setup with a fresh session.

Notes supplies the dedicated `notes-daemon` agent and base configuration under `.opencode-daemon/`. The host creates `opencodeDirectory` before launching Notes and installs these files there as project configuration, with its `allowedReadPaths`. A launcher may refresh that configuration before setup commands, but must preserve the configured location. The existing server loads the capture agent and tools for that location, while retaining its own credentials and global configuration. Setting isolated XDG paths on a client does not isolate an already-running server.

`opencodeModels` is an ordered fallback chain. Notes reads final assistant text from stdout JSON events and keeps stderr separate. A model result must explicitly report success after writing the note; a reported failure, malformed result, command failure, or timeout advances to the next model. `sessionTimeoutSeconds` covers setup and execution together for each attempt, so `passTimeoutSeconds` must leave enough time for every configured attempt and cleanup.

The session policy starts with deny-all and replays the resolved agent rules in order, retaining denials and intentional exceptions and converting approval requests to denials. Allowances are limited to read/glob/grep, web research, GitHub and Exa tools, external directories, and Notes MCP list/read/write. Broad or unrelated tool allowances are discarded. Shell, direct filesystem edits, questions, delegation, browser tools and note deletion remain denied. Session rules override agent rules in OpenCode, so preserving the ordered restrictions matters. This flow is verified against OpenCode 2.0.3.

The supplied configuration uses a read-only GitHub MCP endpoint. Keep that endpoint and credential isolation: the `github_*` permission itself does not distinguish reads from writes. MCP permissions use resource `*`, so Notes write permission cannot enforce exactly one call or restrict repository arguments. Those remain agent instructions and MCP service responsibilities.

Native grep remains enabled for repository research. In OpenCode 2.0.3 it checks the search root and query, but does not apply file-read denials to matched contents. Sensitive-file read denials therefore do not prevent those files appearing in grep results within authorised search roots. Hosts requiring that stronger boundary should deny grep in the agent policy.

The agent must investigate before writing. Notes record the repository paths or primary sources inspected, evidence-based findings, and the requested output, such as an implementation plan. A capture cannot complete by merely paraphrasing its issue text; if the available read tools cannot support the investigation, the daemon leaves the issue open as failed.

A failed issue receives one bounded, sanitised error summary when the daemon has an actionable typed error. Unknown failures use a generic public message. Complete error objects remain in daemon logs rather than exposing stack traces, credentials, request bodies, or filesystem paths in GitHub comments.

OpenCode infers the target repository from the capture and writes under `projects/{owner}/{repo}`. Captures without a resolvable repository use `projects/local/captures`. Completion comments report the note commit SHA rather than exposing a local filesystem path.

Claim labels are ownership checked before GitHub mutations. The daemon does not automatically take over stale claims; remove an `agent:processing:*` label manually only after confirming its worker is no longer processing the issue.

Session, queue-pass, and external command timeouts are configured in daemon YAML. On timeout or cancellation, Notes terminates the child process group and allows ten seconds before forcing termination, leaving time for a configured wrapper to finish its own cleanup. Cancellation does not start a fallback. Persistent pass failures exit after the configured threshold so systemd can restart the daemon.
