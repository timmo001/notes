---
title: Install
description: Install notes from the AUR or build it locally with mise.
---

## Arch Linux

Install the stable binary package with an AUR helper:

```bash
yay -S repo-notes-bin
```

Install `repo-notes-git` instead to track relevant changes on `main`:

```bash
yay -S repo-notes-git
```

Both packages install Git, the `notes` binary, and Bash, Fish, and Zsh completions.

Stable releases use a manually chosen `YYYYMMDD.N` version. Create a blank
GitHub draft, optionally generate its release notes, then publish it to build
Linux archives, deb and RPM packages and update `repo-notes-bin`.

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
