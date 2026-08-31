---
title: Omarchy plugin
description: Browse, edit, create, and capture notes from the Omarchy bar.
---

The Notes plugin adds a persistent service, bar widget, and keyboard-first panel
to Omarchy Quattro. It uses the Notes CLI for note management and keeps local
capture as one panel subview.

## Requirements

- Omarchy Quattro
- [Notes installed](/install/) and available on `PATH`
- A configured Notes vault
- `notes-capture-local` on `PATH` for capture

Install and enable the standalone plugin after reviewing its source:

```bash
omarchy plugin add https://github.com/timmo001/omarchy-notes.git
```

For an unattended installation from a repository you trust:

```bash
omarchy plugin add https://github.com/timmo001/omarchy-notes.git --enable --yes
```

## Browse and search

Select the Notes widget to open an overview with Notes, Handoffs, New note, New
handoff, and Capture note actions.

Notes and Handoffs show entries from every repository. Each view provides
repository, tag, and priority filters; modified and name sorting in either
direction; and repository, priority, or ungrouped display. Typing runs a
debounced ranked search across all repositories. Search ranking comes from:

```text
notes search --query <text> --all --format json
```

Normal lists use `notes list --all --format json`. Up and Down move the cursor,
Enter opens an item, and the selected row is kept visible. Escape clears the
active filter before going back. Tab switches bar panels where the shell
supports it.

## Note actions

The detail view shows repository, tags, priority, modified time, and rendered
Markdown. Its action menu can:

- edit the full Markdown content in the panel
- open the note in an external editor
- open the note using any target returned by `notes agents --format json`
- set low, medium, high, or critical priority
- move to a target returned by `notes targets --format json`
- delete after an explicit confirmation

Native edits read the current content and revision hash with `notes read
--json`, then submit content on standard input to `notes write --stdin
--expected-hash ... --json`. Ctrl+Enter saves. Mutating commands are serialised,
and successful mutations refresh the list.

New note and New handoff provide native forms for repository, name,
description, and Markdown content. They submit content on standard input to
`notes create`.

## Capture

Capture note retains the local capture workflow. The host-owned wrapper must
support:

```text
notes-capture-local --status --json
notes-capture-local --stdin --json [--repository owner/repository]
```

The status command exits with zero when available. The submission command reads
the capture from standard input and returns JSON with `"status": "success"`.
It normally forwards to a configured [capture processor](/integrations/capture-daemon/)
and may require `OPENCODE_SERVER_PASSWORD`.

Ctrl+Enter sends a capture. Submissions run one at a time, further submissions
wait in memory, and closing the panel does not cancel them. A shell restart loses
the pending queue. Failures save the submitted text and send a local
notification.

Optional repository choices are read from:

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

The current draft and latest failed submission are stored unencrypted at:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-draft.txt
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-failed-draft.txt
```

## IPC

The `timmo.notes` target provides `open`, `close`, `show`, `hide`, `toggle`, and
`capture`. The capture method opens the panel directly in the capture subview.

```bash
omarchy-shell timmo.notes toggle
omarchy-shell timmo.notes capture
```

## Update and remove

```bash
omarchy plugin update timmo.notes
omarchy plugin remove timmo.notes
```

Removing the plugin does not remove Notes, capture services, configuration,
credentials, targets, or drafts. Plugin publication from the Notes repository is
independent of stable CLI releases.

## Security

The plugin runs unsandboxed inside `omarchy-shell`. It starts local Notes,
capture, editor, agent, and notification commands. The QML does not make direct
network requests, but Notes mutations may commit and push, and capture may use
the configured OpenCode server. Review the plugin and host configuration before
installation.
