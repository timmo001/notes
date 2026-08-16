# Notes Capture for Omarchy

An Omarchy bar widget and panel for sending text to a local Notes capture
processor. It keeps drafts locally, supports automatic or explicit repository
selection, and queues submissions while the panel remains responsive.

## Requirements

- Omarchy Quattro
- Notes installed with the `notes` executable available on `PATH`
- A `notes-capture-local` executable available on `PATH`
- A running `notes-capture-opencode.service` user service

`notes-capture-local` is a host-owned integration command. It must support:

```text
notes-capture-local --status --json
notes-capture-local --stdin --json [--repository owner/repository]
```

The second command receives the capture text on standard input and returns the
Notes JSON capture result on standard output. The command and service must
provide the local daemon configuration and `OPENCODE_SERVER_PASSWORD` required
by `notes capture`.

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

The widget defaults to the right bar section. Existing Omarchy placement and
inline settings remain compatible because the plugin ID is unchanged.

## Use

Select the widget to open its panel. Enter up to 12,000 characters and select
Send, or press Ctrl+Enter. Escape closes the panel. Tab, Shift+Tab, Up, and Down
move between controls and repository choices.

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

The plugin exposes the `timmo.notes-capture` shell IPC target with `open`,
`close`, `show`, `hide`, and `toggle` methods:

```bash
omarchy-shell timmo.notes-capture toggle
```

User-owned shortcuts can invoke that command without changing the plugin.

## Settings

- `primaryOnly`: show the widget only on the selected output, enabled by
  default
- `primaryOutput`: optional output name used when `primaryOnly` is enabled;
  the first available output is used when this is empty or unavailable

## Local files

The plugin reads the optional repository list above. It reads and writes these
plain-text recovery files:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-draft.txt
${XDG_CACHE_HOME:-$HOME/.cache}/dot/notes-capture-failed-draft.txt
```

Drafts are not encrypted. Clear the panel to remove the current and failed
draft files' contents.

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

## Remove

```bash
omarchy plugin remove timmo.notes-capture
```

Removing the plugin does not remove its host-owned service, wrapper command,
repository list, daemon configuration, credentials, or draft files.

## Validate from source

```bash
omarchy plugin validate .
/usr/lib/qt6/bin/qmllint \
  -I /usr/lib/qt6/qml \
  --import disable \
  --unqualified disable \
  ./*.qml
```

## Security

This plugin runs unsandboxed inside `omarchy-shell` when enabled. Review its
source and the host-owned `notes-capture-local` command before installing it.
Capture text and explicit repository targets are passed to that executable.
