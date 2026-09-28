# API (`apps/api`) and generated SDK (`packages/api-client`)

Hono API defined with `@hono/zod-openapi`. Runs on Bun locally (port 4040, `apps/api/dev.ts`) and as a Cloudflare Worker when deployed (`apps/api/index.ts` + hourly cron `apps/api/cron.ts`, see `infra/api.ts`). Worker code must not do I/O, timers or randomness at module scope, and must not use `fetch(..., { redirect: "error" })` (use `fetchNoRedirect` from `src/lib/strict-fetch.ts`). Do not start the server — it requires SST-linked resources.

## Layout

```
apps/api/dev.ts                Bun server entry (local, port 4040, background refresh)
apps/api/index.ts              Cloudflare Worker entry (deployed)
apps/api/cron.ts               Cron Worker: hourly price snapshots (deployed)
apps/api/src/app.ts            OpenAPIHono app: CORS, logger, /health, mounts /auth, serves /openapi.json
apps/api/src/routes/           Route modules (auth.ts) + index.ts re-exports
apps/api/src/schemas/index.ts  Shared zod response schemas (ErrorSchema, MeResponseSchema, ...)
apps/api/src/lib/auth.ts       Better Auth instance (lazy singleton via getAuth())
apps/api/src/middleware/auth.ts Session middleware
apps/api/scripts/generate-openapi.ts  Writes packages/api-client/openapi.json
```

## Route conventions

- Define routes with `createRoute({ method, path, operationId, tags, responses })` and register via `app.openapi(route, handler)`. Every response body needs a zod schema — this feeds the OpenAPI spec and SDK.
- Always set a stable `operationId`; it becomes the SDK function name.
- Mount new route modules in `apps/api/src/app.ts` via `app.route("/prefix", routes)` and export them from `src/routes/index.ts`.
- Runtime config and secrets are SST links only — never `process.env`. Read secrets via `secret("<Name>")` / feature toggles via `feature()` / CORS via `corsOrigins()` from `apps/api/src/lib/config.ts`. Tests override with `setSecrets` / `setFeatures` and clear with `resetConfig()`. New secret: declare in `infra/secrets.ts`, add to `apiSecrets`, add the name to `SecretName`.
- Keep expensive initializations lazy (module-level singletons initialized on first use) — the Worker environment resolves `Resource` at request time. See `getAuth()` and `getAllowedOrigins()` for the pattern.

## Auth (Better Auth)

- Mounted at `/auth` (`basePath: "/auth"` in `src/lib/auth.ts`); email OTP via Resend (falls back to console.log if no `ResendApiKey`).
- Drizzle adapter over `@stackforge/core/db` with schema from `@stackforge/core/db/schema`.
- Mobile uses session cookies (not bearer tokens). Trusted origins include all Expo scheme variants (`stackforge`, `stackforgedev`, `stackforgebeta`, `stackforgeprod`) — if you add an app scheme/env, update `getTrustedOrigins()`.
- CORS allowlist in `src/app.ts` covers localhost ports 4040/8081/19006/4321 plus deployed URLs — extend it when adding new clients.

## SDK generation (mandatory after API changes)

```bash
bun run generate:sdk   # from repo root
```

This runs `apps/api/scripts/generate-openapi.ts` (dumps `packages/api-client/openapi.json`) then `@hey-api/openapi-ts` (config: `packages/api-client/openapi-ts.config.ts`) into `packages/api-client/src/generated/`. Never edit generated files or `openapi.json` by hand.

Consumers import from `@stackforge/api-client` (exports `src/index.ts`). Mobile wraps it in `apps/mobile/src/services/api/client.ts` (sets baseUrl + auth cookie interceptor).

## Tests

`apps/api/src/routes/auth.test.ts` uses `bun:test` with `mock.module()` to stub `../lib/auth` and the db. Run with `bun test apps/api`. Follow this pattern for new route tests.
