---
title: Omarchy capture
description: Capture notes directly from an Omarchy bar widget.
---

The Notes Capture plugin adds a bar widget and panel to Omarchy Quattro. It
sends text directly to the local Notes capture processor without using the web
capture app or GitHub issue queue.

The integration has three parts:

```text
Omarchy plugin -> notes-capture-local -> notes capture -> OpenCode server
```

The plugin repository contains the QML interface. The host owns the wrapper,
processor configuration, OpenCode service, and credentials.

## Requirements

- Omarchy Quattro
- [Notes installed](/install/)
- A `notes-capture-local` executable on `PATH`
- A configured, password-protected OpenCode server

Installing the plugin does not create the wrapper, service, Notes
configuration, or `OPENCODE_SERVER_PASSWORD` environment variable.

The wrapper must support these commands:

```text
notes-capture-local --status --json
notes-capture-local --stdin --json [--repository owner/repository]
```

The status command reports availability through its exit code: zero means the
processor is ready. The submission command reads capture text from standard
input. A successful submission exits with zero and prints JSON containing
`"status": "success"`; an optional `summary` string is shown in the panel.

A typical wrapper forwards both forms to `notes capture --config ...` and
supplies the configuration and password required by the
[capture processor](/integrations/capture-daemon/).

## Install

Review the plugin repository, then add and enable it:

```bash
omarchy plugin add \
  https://github.com/timmo001/omarchy-notes-capture.git
```

For an unattended installation from a repository you already trust:

```bash
omarchy plugin add \
  https://github.com/timmo001/omarchy-notes-capture.git \
  --enable --yes
```

## Use

Select the widget to open the panel. Enter up to 12,000 characters, then select
Send or press Ctrl+Enter. Escape closes the panel. Tab moves from the editor to
Send. Up and Down move through the repository filter and available targets.

Submissions run one at a time. Further submissions wait in memory, and closing
the panel does not cancel them. The queue is lost if `omarchy-shell` restarts.
Clear removes queued submissions and clears the displayed result of an active
submission, but it does not stop the active wrapper process.

The plugin exposes the `timmo.notes-capture` shell IPC target with `open`,
`close`, `show`, `hide`, and `toggle` methods:

```bash
omarchy-shell timmo.notes-capture toggle
```

## Repository targets

The picker always includes Automatic repository resolution. Add explicit
targets with this host-owned file:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-repositories.json
```

```json
[
  {
    "label": "Display name",
    "repository": "owner/repository"
  }
]
```

The plugin reloads this file when it changes. Invalid JSON or a value other
than an array leaves only Automatic resolution. Keep each entry to the shown
shape because entries are displayed and passed to the wrapper without further
validation.

## Draft recovery

The editor saves its current draft to:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-draft.txt
```

This draft is restored when the plugin loads. A failed submission is copied to
a separate recovery file:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-failed-draft.txt
```

The failed draft is not restored into the editor automatically. Open the file
directly to recover it. A later failure replaces it, and a successful capture
does not remove it. Clear empties both files. Drafts are plain text and are not
encrypted.

## Troubleshooting

Confirm that the wrapper is available and that its status check succeeds:

```bash
command -v notes-capture-local
notes-capture-local --status --json
```

If your wrapper uses `notes-capture-opencode.service`, inspect its status and
logs:

```bash
systemctl --user status notes-capture-opencode.service
journalctl --user -u notes-capture-opencode.service
```

Check the failed-draft file after a rejected or malformed submission. If
explicit repositories disappear, validate the repository JSON file against the
array shape above.

## Update and remove

```bash
omarchy plugin update timmo.notes-capture
omarchy plugin remove timmo.notes-capture
```

Removing the plugin does not remove host-owned services, wrapper commands,
configuration, credentials, repository targets, or draft files. Plugin changes
are published from the Notes repository independently of stable Notes CLI
releases.

## Security

The plugin runs unsandboxed inside `omarchy-shell`. Its QML does not connect to
the network directly, but the wrapper may send captures to the configured
OpenCode server. Review both the plugin and wrapper before installation.
