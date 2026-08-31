# Notes for Omarchy

An Omarchy Quattro service, bar widget, and keyboard-first panel for browsing,
searching, editing, creating, moving, and capturing repository notes.

## Requirements

- Omarchy Quattro
- `notes` on `PATH`
- A Notes vault configured for the CLI
- `notes-capture-local` on `PATH` to use Capture note

The capture wrapper must support:

```text
notes-capture-local --status --json
notes-capture-local --stdin --json [--repository owner/repository]
```

The status command exits with zero when capture is available. The submission
command reads the note from standard input and returns JSON with
`"status": "success"`. Capture usually also requires a configured OpenCode
capture processor and `OPENCODE_SERVER_PASSWORD`.

## Install

Review the repository, then add and enable it:

```bash
omarchy plugin add https://github.com/timmo001/omarchy-notes.git
```

For an unattended installation from a repository you trust:

```bash
omarchy plugin add https://github.com/timmo001/omarchy-notes.git --enable --yes
```

## Use

Select the Notes bar widget to open the overview. It provides:

- Notes and Handoffs lists across every repository
- ranked global search
- repository, tag, and priority filters
- modified or name sorting in either direction
- repository, priority, or ungrouped display
- note metadata and rendered Markdown
- guarded native editing, external editing, agent opening, priority changes,
  moves, and confirmed deletion
- native note and handoff creation
- local capture with draft recovery and queued submission

Type in a list or action view to filter or search. Use Up and Down to move,
Enter to select, Escape to clear the current filter and then go back, and Tab
to switch bar panels where supported. Native edit, create, and capture forms use
Ctrl+Enter to submit.

The panel runs normal lists with `notes list --all --format json` and ranked
searches with `notes search --query ... --all --format json`. Mutations run one
at a time. Guarded edits use the hash returned by `notes read --json`.

The `timmo.notes` shell IPC target provides `open`, `close`, `show`, `hide`,
`toggle`, and `capture`. Capture opens the capture subview directly:

```bash
omarchy-shell timmo.notes toggle
omarchy-shell timmo.notes capture
```

## Capture files

Optional capture repository targets are loaded from:

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

The current capture draft and the latest failed submission are stored as plain
text in:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-draft.txt
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-failed-draft.txt
```

Drafts are not encrypted. Capture submissions run one at a time and remain
active when the panel closes. The in-memory queue is lost if `omarchy-shell`
restarts. A failed submission saves the text and sends a local notification.

## Settings

- `primaryOnly`: show the widget only on the selected output, enabled by default
- `primaryOutput`: output name used by `primaryOnly`; the first available
  output is used when this is empty or unavailable

## Update and remove

```bash
omarchy plugin update timmo.notes
omarchy plugin remove timmo.notes
```

Removing the plugin does not remove Notes, capture services, credentials,
repository targets, or draft files.

## Validate from source

Run from `omarchy-plugin/`:

```bash
omarchy plugin validate .
/usr/lib/qt6/bin/qmllint \
  -I /usr/lib/qt6/qml \
  --import disable \
  --unqualified disable \
  ./*.qml
```

These checks do not exercise shell integration, keyboard navigation, external
editors and agents, or capture processing at runtime.

## Security

The plugin runs unsandboxed inside `omarchy-shell`. It starts the local `notes`,
`notes-capture-local`, `nvim`, and Omarchy notification commands. The QML does
not connect to the network directly, but Notes mutations may commit and push,
agent opening starts configured Herdr integrations, and capture may call an
OpenCode server. Review the plugin and local command configuration before use.
