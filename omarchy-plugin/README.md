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
capture processor.

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
- guarded native editing, external editing, normal or planning agent opening,
  priority changes, moves, and confirmed deletion
- native note and handoff creation
- local capture with draft recovery and queued submission

With a workspace context provider configured, the overview lists the attached
workspace's notes above the actions, including handoffs. Capture note appears
immediately above All notes.
Workspace, action, repository, and priority headings use the Git panel's framed
section-heading style with icons.
Repository and priority groups in All notes and Handoffs can be collapsed with
a click or Enter on the heading. Each view remembers its collapsed groups while
the panel is loaded. Search shows matching notes regardless of collapsed groups.

The workspace heading shows the provider's `workspace.label`, falling back to
Current workspace when no name is supplied. Its refresh button rechecks the
attached directory and reloads its notes and handoffs. All notes and All handoffs
each have one heading-level refresh button for the complete listing and any
active search. Refresh keeps the current view, filters, collapsed groups, and selected
row where it still exists. The workspace button is disabled only for a manual
refresh, through context detection and the note reload. Background updates stay quiet.
Ctrl+R refreshes the full listing, workspace context, and any active search.

The bar and workspace section share one context result. A provider returns JSON
with `attached: boolean` and `cwd: string | null`. Additional fields are allowed;
`workspace.label` supplies the heading. Invalid context clears the workspace.

Set `workspaceContextFile` to watch a shared JSON file for immediate updates.
Use an absolute path or a filename relative to `XDG_RUNTIME_DIR`. This takes
precedence over command polling. `workspaceContextRefreshCommand` can request
the provider to write fresh context when the panel opens or a heading is refreshed.
The command runs through `bash -lc`; the provider must publish even when the
context is unchanged. Without a refresh command, the plugin reloads the file.

Alternatively, set `workspaceContextCommand` to a JSON command such as
`dot herdr context --json`. It runs through `bash -lc` every 30 seconds and on
opening or refreshing the panel. Exit non-zero on detection failure; return
`attached: false` when no terminal client is attached.

For attached context with an absolute directory, the plugin runs
`notes list --format json` in that directory. Project identity follows the normal
Notes remote and local-scope rules. Changing directory or detaching clears the
old count immediately when observed; late list responses cannot restore it.
In file mode, directory changes reload the notes immediately and label-only
changes update the heading. The current directory's notes are also rechecked
every 30 seconds to pick up external edits, without rerunning context detection.
Context remains visible while the terminal is attached even if another desktop
window has focus. An empty provider or a failed context/list command hides the
workspace section and leaves the muted Notes icon without a number. An attached
project with zero notes keeps its workspace heading and muted icon. The icon
and count use the same 10px font size as the Git widget.

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

- `workspaceContextCommand`: optional workspace JSON provider; empty by default
- `workspaceContextFile`: optional watched JSON provider file; empty by default
- `workspaceContextRefreshCommand`: optional command requesting a fresh provider file
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
OpenCode command. Review the plugin and local command configuration before use.
