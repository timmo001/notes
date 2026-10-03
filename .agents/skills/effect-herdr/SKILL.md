---
name: effect-herdr
description: Use @timmo001/effect-herdr for Effect TypeScript integrations with Herdr's local socket API. Apply when adding, migrating, debugging or reviewing SDK consumers, including agent coordination, event streams, panes and workspaces. For operating terminals or workspaces as an agent, use the herdr skill.
compatibility: Requires TypeScript, @timmo001/effect-herdr with its pinned Effect and @effect/platform-node-shared versions, Node.js 20+ or Bun, and a Herdr server on the SDK's supported protocol for live checks.
---

# Effect Herdr

Prefer `@timmo001/effect-herdr` when an Effect application talks to Herdr. Use
its services and layers instead of hand-written socket clients or `herdr` CLI
wrappers. It is a maintained fork of `dmmulroy/herdr-ts-sdk` published under
this name. Use the separate `herdr` skill when operating panes, tabs or
workspaces as an agent.

## Read the current contract

1. Inspect the consumer's manifest, lockfile, overrides and patches for the
   resolved SDK and Effect versions. Read the installed SDK README and
   declarations, and check its `herdr.protocol` metadata against the running
   server. Treat declared but absent packages as unverified.
2. Read the relevant current docs before coding:
   - [README](https://github.com/timmo001/effect-herdr/blob/main/README.md):
     setup, API shape, errors and events.
   - [Package manifest](https://github.com/timmo001/effect-herdr/blob/main/package.json)
     and [exports](https://github.com/timmo001/effect-herdr/blob/main/src/index.ts):
     dependency pins, protocol and public surface.
   - [Examples](https://github.com/timmo001/effect-herdr/tree/main/examples):
     executable recipes. They change live Herdr state, so read rather than run
     them.
     These links follow development. Prefer the installed release's docs and
     declarations when they differ, and make any required upgrade explicit.

## Use the package

1. Compose `herdrSdkLayer` (or `herdrSdkLayerFromOptions`) or a namespace
   service layer at the application boundary, and keep runtime execution there.
   Apply the `effect` skill alongside the SDK docs.
2. Preserve boundary semantics:
   - Keep typed failures such as `HerdrUnsupportedProtocol` visible; install
     matching Herdr and SDK releases rather than bypassing the check.
   - Keep event streams and SSH agent leases within their owning scope.
   - A prompt timeout can follow delivery; inspect state before retrying.
3. For coordination, use the agent prompt/wait operations for one-shot work and
   event streams for long-lived observation. Do not build polling loops or a
   second lifecycle state machine around them.
   - Subscriptions are live-only. For a cached view, follow Herdr's
     [subscribe-before-snapshot ordering](https://herdr.dev/docs/socket-api/#raw-methods)
     and resynchronise after reconnecting.
   - Keep assignment decisions in the consumer and live state in Herdr.
     Metadata tokens are transient display data, not durable task records.
4. Verify through the public SDK boundary. Run the consumer's typecheck and
   relevant tests against its resolved packages. For live checks, target the
   intended Herdr server explicitly and confirm the changed operation and its
   cleanup. Report checked versions and any verification that was blocked.
