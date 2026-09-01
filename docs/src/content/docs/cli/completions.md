---
title: Shell Completions
description: Generate shell completions for notes.
sidebar:
  order: 3
---

`notes` can print completion scripts for Bash, Fish, and Zsh:

```bash
notes --completions bash
notes --completions fish
notes --completions zsh
```

The Arch packages install Bash, Fish, and Zsh completions automatically. For a local binary, write the generated script into the shell-specific completion directory for your environment.
