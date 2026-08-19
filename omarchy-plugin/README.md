# Notes Capture for Omarchy

An Omarchy bar widget and panel for sending text to a local Notes capture
processor. It keeps drafts locally, supports automatic or explicit repository
selection, and queues submissions while the panel remains responsive.

## Requirements

- Omarchy Quattro
- A `notes-capture-local` executable available on `PATH`

`notes-capture-local` is a host-owned integration command. It must support:

```text
notes-capture-local --status --json
notes-capture-local --stdin --json [--repository owner/repository]
```

The status command reports availability through its exit code: zero means the
processor is ready. The second command receives capture text on standard input.
A successful submission must exit with zero and print JSON containing
`"status": "success"`; an optional `summary` string is shown in the panel.

The wrapper's host integration usually requires [Notes](https://notes.timmo.dev/install/),
a configured OpenCode service, and `OPENCODE_SERVER_PASSWORD`. Installing this
plugin does not create the wrapper, service, configuration, or credentials. See
the [Omarchy capture documentation](https://notes.timmo.dev/integrations/omarchy-capture/)
for the full integration contract.

## Install

Review the repository, then add the plugin:

```bash
omarchy plugin add \
  https://github.com/timmo001/omarchy-notes-capture.git
```

Accept the prompt to enable the plugin during installation. For an unattended
install from a repository you already trust:

```bash
omarchy plugin add \
  https://github.com/timmo001/omarchy-notes-capture.git \
  --enable --yes
```

The widget defaults to the right bar section.

## Use

Select the widget to open its panel. Enter up to 12,000 characters and select
Send, or press Ctrl+Enter. Escape closes the panel. Tab moves from the editor to
Send. Up and Down move through the repository filter and available choices.

Submissions run one at a time. Further submissions wait in memory, and closing
the panel does not cancel them. The queue is lost if `omarchy-shell` restarts.
Clear removes queued submissions and clears the displayed result of an active
submission, but it does not stop the active wrapper process.

The repository picker includes an Automatic target. Optional explicit choices
come from this host-owned JSON file:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-repositories.json
```

The expected shape is:

```json
[
  {
    "label": "Display name",
    "repository": "owner/repository"
  }
]
```

The plugin reloads the file when it changes. Invalid JSON or a value other than
an array leaves only Automatic resolution. Keep each entry to the shown shape
because entries are displayed and passed to the wrapper without further
validation.

The plugin exposes the `timmo.notes-capture` shell IPC target with `open`,
`close`, `show`, `hide`, and `toggle` methods:

```bash
omarchy-shell shell toggle timmo.notes-capture
```

User-owned shortcuts can invoke that command without changing the plugin.

## Settings

- `primaryOnly`: show the widget only on the selected output, enabled by
  default
- `primaryOutput`: optional output name used when `primaryOnly` is enabled;
  the first available output is used when this is empty or unavailable

## Local files

The plugin reads the optional repository list above. It saves the current draft
to this plain-text file and restores it when the plugin loads:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-draft.txt
```

A failed submission is copied to a separate recovery file:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-failed-draft.txt
```

The failed draft is not restored into the editor automatically. Open the file
directly to recover it. A later failure replaces it, and a successful capture
does not remove it. Drafts are not encrypted. Clear empties both files.

## Network behaviour

The QML plugin does not connect to the network directly. It starts
`notes-capture-local`, which may send the capture to the configured OpenCode
server. The Notes capture agent may research through configured web and GitHub
tools, write a note, commit that note, and best-effort push the notes vault.
Review the local Notes daemon configuration to understand its allowed paths,
models, endpoint, credentials, and external tools.

On capture failure, the plugin runs this local notification command:

```text
omarchy notification send -u critical --app-name "Notes Capture" ...
```

It does not run privileged commands or install software.

## Update

Review and apply the next fast-forward update:

```bash
omarchy plugin update timmo.notes-capture
```

Plugin changes are published from the Notes repository independently of stable
Notes CLI releases.

## Remove

```bash
omarchy plugin remove timmo.notes-capture
```

Removing the plugin does not remove its host-owned service, wrapper command,
repository list, daemon configuration, credentials, or draft files.

## Troubleshooting

Confirm that the wrapper is available and its status check succeeds:

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
explicit repositories disappear, validate the repository JSON against the
array shape above.

## Validate from source

Run these commands from the `omarchy-plugin/` directory:

```bash
omarchy plugin validate .
/usr/lib/qt6/bin/qmllint \
  -I /usr/lib/qt6/qml \
  --import disable \
  --unqualified disable \
  ./*.qml
```

These checks validate the manifest and lint the QML. They do not exercise the
wrapper, keyboard navigation, queue, or draft recovery at runtime.

## Security

This plugin runs unsandboxed inside `omarchy-shell` when enabled. Review its
source and the host-owned `notes-capture-local` command before installing it.
Capture text and explicit repository targets are passed to that executable.
