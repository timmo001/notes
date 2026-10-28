---
name: notes-release
description: Version and release the notes CLI and its library, @timmo001/effect-notes. Use when bumping versions, preparing or publishing a GitHub release, or debugging the Package stable release workflow.
license: Apache-2.0
compatibility: Requires mise, Bun and the GitHub CLI from the notes repository root.
---

# Releasing notes

One semver version covers the CLI and `@timmo001/effect-notes`. Publishing a non-prerelease GitHub release runs `.github/workflows/release.yml`. It builds the Linux archives, deb and RPM packages, publishes `@timmo001/effect-notes` to npm and JSR through OIDC with no tokens, builds `repo-notes-bin` for the `timmo` pacman repository, attaches it to the release and updates it in the AUR. Prereleases publish nothing. `repo-notes-git` follows `main` on its own, versioned from the latest tag.

## Bump the version

The npm and JSR jobs fail unless the release tag matches every manifest exactly, with no `v` prefix. Set the same version in:

- `package.json` (the CLI's `--version` and the MCP server read it)
- `packages/effect-notes/package.json` and `packages/effect-notes/jsr.json`
- `pkgver` in `.scripts/linux/PKGBUILD.bin` (the release rewrites it, but keep it current)

Run `bun install` to refresh `bun.lock`, then run the checks from `AGENTS.md` before committing.

Keep the epochs in the PKGBUILDs under `.scripts/linux/`: `epoch=1` for the binary packages and `epoch=2` for `repo-notes-git`. Releases used `YYYYMMDD.N` tags before 1.0.0, and without the epoch pacman sees semver as a downgrade. The git package needs 2 because one build already shipped as `1:20261010.0.r107`.

Releasing is a public publish you can't undo. Commit, push and create the release only when the user asks, and use their chosen version. Create the release with `gh release create <version> --generate-notes`. The workflow's `release-version` dispatch input reruns only the Linux packages, since the npm and JSR jobs need a release event.

## Registries

Both registries are already set up: the npm package trusts `release.yml` and the JSR package is linked to this repository. A new package under `packages/` needs the same before its first release, which is the `npm-jsr-first-publish` skill's job.
