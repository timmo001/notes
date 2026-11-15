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

Shared layout, components and config defaults come from [`@timmo001/docs-kit`](https://github.com/timmo001/groundwork/tree/main/packages/docs-kit).

## Deployment

The site deploys to Cloudflare Workers with Blume's Astro server bundle, which also serves the read-only docs MCP at `/mcp`. Workers Builds uses:

- Root directory: `docs`
- Production branch: `main`
- Build command: `bun run build`
- Deploy command: `bun run deploy`
- Non-production deploy command: `bun run deploy:preview`

`wrangler.jsonc` owns the Worker name, compatibility settings, custom domain and observability. The Astro Cloudflare adapter writes the deployable config to `dist/server/wrangler.json`, which the deploy scripts use. The repository checkout stays available above the root directory so the generators can read `../src`. Generated docs stay committed.
