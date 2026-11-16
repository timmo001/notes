# Notes Docs

The [notes](https://github.com/timmo001/notes) documentation site, built with Blume and Astro. It's available at <https://notes.timmo.dev>.

## Commands

Run these from the repository root:

- `mise run serve:docs`: run the dev server in the background
- `mise run docs:build`: build the site
- `mise run docs:preview`: preview the built site
- `mise run docs:check`: validate the site with Blume
- `mise run docs:gen`: regenerate the CLI and MCP reference pages from the repository source
- `mise run docs:brand`: regenerate `public/logo.png`, `public/apple-touch-icon.png` and the GitHub social preview from `src/assets/logo.svg`
- `mise run docs:plan`: build the site, then show what deploying it would change
- `mise run docs:deploy`: build the site, then deploy it

Shared layout, components and config defaults come from [`@timmo001/docs-kit`](https://github.com/timmo001/groundwork/tree/main/packages/docs-kit).

## Deployment

The site deploys to the `notes-docs` Cloudflare Worker with Blume's Astro server bundle, which also serves the read-only docs MCP at `/mcp`. [`alchemy.run.ts`](alchemy.run.ts) is its [Alchemy](https://alchemy.run) stack: the Worker's name, custom domain and compatibility settings. The Deploy docs workflow runs `mise run docs:deploy` on pushes to `main`. Generated docs stay committed.

CI's Cloudflare token and the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets come from [`stacks/github.ts`](stacks/github.ts). Deploy it once from a machine with `mise run docs:deploy:github`, and again to rotate the token.
