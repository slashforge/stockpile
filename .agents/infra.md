# Infrastructure, Landing, dev-mcp

SST v4 on Cloudflare (`home: "cloudflare"`). Entry: `sst.config.ts`, which imports `infra/*` modules. Never run `sst dev`/`sst deploy` — user's job.

## Stages

`infra/utils.ts`: `DEPLOYED_STAGES = ["prod", "dev", "beta"]`. Any other stage is local dev — resources become `sst.x.DevCommand`s instead of real Cloudflare resources.

## infra/ modules

```
config.ts    AppConfig Linkable: apiUrl/webUrl/corsOrigins/authFromEmail/appScheme, switches on isDeployed()
secrets.ts   SST secrets: DatabaseUrl, Privy*, JupiterApiKey, HeliusApiKey, SolanaPaymasterKey, TokensApiKey, PythApiKey, CongressApiKey, OpenaiApiKey, BlockedMints (`apiSecrets` = those linked to the API)
domains.ts   stockpile.cash; stage-prefixed subdomains except prod (api.<host>, <host>)
database.ts  Cloudflare Hyperdrive (deployed only), origin parsed from DatabaseUrl; local dev uses DatabaseUrl directly
api.ts       Deployed: cloudflare.Worker (handler apps/api/index.ts, esbuild defines process.version). Local: DevCommand `bun dev` in apps/api on :4040. No env vars, links only
landing.ts   Astro site deployment
expo.ts      Local-only DevCommand for Expo (autostart: false), injects EXPO_PUBLIC_API_URL and the Privy ids from secrets
dev-mcp.ts   Local-only DevCommand for apps/dev-mcp on :4444 (/mcp)
orm.ts       Local DevCommand: drizzle-kit studio
```

Rules:
- Anything the API/landing reads at runtime must be `link`ed (see `API_LINKS` in `infra/api.ts`) and accessed via `Resource.*`. Adding a new secret: declare in `secrets.ts`, link it, then `Resource.<Name>.value`.
- The API Worker cannot use Node-only APIs beyond what the esbuild defines shim; keep code Workers-compatible.
- Type declarations for linked resources live in `sst-env.d.ts` (generated — do not edit).

## Landing (`apps/landing`)

Astro 6 + Tailwind 3 + MDX blog, deployed to Cloudflare via `@astrojs/cloudflare`. Local port 4321.

- Pages: `src/pages/` (index, `blog/`, `og/` for satori-generated OG images via `src/lib/og-image.ts` + `og-image-renderer.mjs`).
- Blog content: `src/content/blog/` (config in `src/content.config.ts`).
- Components/layouts: `src/components/`, `src/layouts/BlogPost.astro`. Site constants: `src/consts.ts`.
- Requires SST for config — do not run standalone.

## dev-mcp (`apps/dev-mcp`)

Single-file Hono + `@modelcontextprotocol/sdk` server (`apps/dev-mcp/index.ts`) exposing local dev tools (db access via linked database secrets, API calls via `DEV_MCP_API_URL`). Local-only; never deployed. `DEV_MCP_ALLOW_WRITES` gates write tools. Typecheck: `bun run --cwd apps/dev-mcp typecheck`.

## Template setup

`bun run setup` (`scripts/setup.ts`) interactively renames the template (name/scope/domain). Only relevant when bootstrapping a fork; don't run it in an established repo.
