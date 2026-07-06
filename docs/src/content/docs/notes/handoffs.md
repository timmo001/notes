---
title: Handoffs
description: Handoff notes are tagged notes with workflow metadata.
sidebar:
  order: 2
---

Handoffs are normal notes with a `handoff` tag. They are used by agent workflows to pass context between sessions.

```yaml
---
repo: owner/repo
date: 2026-07-06T12:00:00+01:00
type: handoff
name: Checkout Flow Handoff
description: Current state and next steps for checkout work.
priority: medium
tags: [handoff]
---
```

## Priority

Handoff priority can be `low`, `medium`, `high`, or `critical`. Missing priority is treated as `medium`.

```bash
notes handoffs
notes handoffs --all
notes handoffs --format json
```

`notes handoff` is an alias for `notes handoffs`.

## Instructions

The standalone `notes` tool only owns storage and listing semantics. Handoff authoring instructions live in the consuming agent configuration, such as the dotfiles handoff skill.
