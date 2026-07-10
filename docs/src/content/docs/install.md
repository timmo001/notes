---
title: Install
description: Install notes from the AUR or build it locally with mise.
---

## Arch Linux

Install the `repo-notes-git` AUR package with an AUR helper:

```bash
yay -S repo-notes-git
```

`repo-notes-git` installs Git, the `notes` binary, and Bash, Fish, and Zsh completions.

## Build Locally

Use the mise tasks to install dependencies and build the binary. The repo pins Node and Bun through mise.

```bash
mise run install
mise run build
```

The compiled binary is written to `dist/notes`:

```bash
./dist/notes --help
```

## Build an Arch Package

Create a local Arch package from the compiled binary:

```bash
mise run package:arch
```

This task is Arch-specific and needs `makepkg` from `base-devel`. The package is written to `dist/` and includes shell completions.
