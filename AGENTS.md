# StackForge — Agent Guide

Bun workspace monorepo (template) deployed with SST on Cloudflare. Package manager and runtime: **bun** (never npm/yarn/pnpm).

## Doc routing

Read the doc(s) matching your task before editing. Multi-layer tasks (e.g. new API route consumed by mobile) require multiple docs.

| Task touches | Read |
|---|---|
| API routes, auth (Better Auth), OpenAPI, generated SDK | `.agents/api.md` |
| Mobile app (Expo / React Native) | `.agents/mobile.md` |
| Postgres schema, Drizzle, mobile SQLite schema, migrations | `.agents/database.md` |
| SST infra, secrets, deployment, landing page, dev-mcp | `.agents/infra.md` |
| Cross-cutting (API + mobile, schema + API, etc.) | All relevant docs above |

## Repo map

```
apps/api            Hono + @hono/zod-openapi API (Bun locally, Cloudflare Worker deployed)
apps/mobile         Expo React Native app (@stackforge/mobile), Expo Router
apps/landing        Astro landing/blog site (Cloudflare)
apps/dev-mcp        Local-only MCP server for dev tooling (port 4444)
packages/core       @stackforge/core — shared Drizzle Postgres schema + db client
packages/api-client @stackforge/api-client — SDK generated from the API's OpenAPI spec
functions           Placeholder workspace (package.json only)
infra/              SST components (api, database, config, secrets, domains, expo, landing, dev-mcp, orm)
sst.config.ts       SST entrypoint; imports infra/* modules
drizzle.config.ts   Root drizzle-kit config (Postgres, schema in packages/core/db/schema)
scripts/setup.ts    Template rename script (`bun run setup`)
```

## Hard rules (repo norms)

1. **Do NOT start dev servers.** No `sst dev`, no `bun dev`, no `expo start`. The user runs them. `apps/api` and `apps/landing` cannot run standalone anyway — they need SST-linked secrets/config.
2. **Do NOT generate or run database migrations.** Only edit schema files (`packages/core/db/schema/`, `apps/mobile/src/db/schema/`). The user runs `drizzle-kit generate`/`migrate`. Never touch `apps/mobile/drizzle/`.
3. **After changing API routes or zod schemas**, regenerate the SDK: `bun run generate:sdk` (root). This runs the API's OpenAPI export then `openapi-ts` in `packages/api-client`. Never hand-edit `packages/api-client/src/generated/` or `openapi.json`.
4. **Secrets** are SST secrets (`infra/secrets.ts`), accessed via `Resource.*` from `sst`. Never hardcode credentials or URLs — env-dependent values live in `infra/config.ts` (`AppConfig`) and `infra/domains.ts`.

## Commands

```bash
bun install               # install workspace deps
bun test apps/api         # API tests (bun:test, mocks via mock.module)
bun run generate:sdk      # regenerate OpenAPI spec + api-client SDK
bunx tsc --noEmit         # typecheck (per package; dev-mcp has `typecheck` script)
```

## Cross-cutting flow (typical feature)

1. Schema change → `packages/core/db/schema/` (see `.agents/database.md`).
2. API route + zod schemas → `apps/api/src/routes/`, `apps/api/src/schemas/` (see `.agents/api.md`).
3. `bun run generate:sdk`.
4. Mobile consumes the SDK via `apps/mobile/src/services/api/client.ts` (see `.agents/mobile.md`).
