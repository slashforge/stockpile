# Stockpile

A template monorepo with mobile app, backend API, and landing page.

## Structure

- `apps/mobile` - Expo React Native app with Better Auth email OTP
- `apps/api` - Hono API backend
- `apps/landing` - Astro landing page
- `packages/core` - Shared database schema and types
- `packages/api-client` - Generated TypeScript SDK from the API's OpenAPI spec

## Getting Started

```bash
bun install
```

### Development

```bash
# Run API + landing (SST-linked apps).
# The Expo dev server is registered as an SST dev command too — select the
# "Expo" pane in the multiplexer to start it (autostart is off).
sst dev

# Or run the mobile app standalone
cd apps/mobile
bun start --clear
```

> **Note**: Do not run `apps/api` or `apps/landing` individually - they depend on SST for secrets and configuration.

### Auth setup

Email sign-in uses Better Auth with email OTPs delivered by Resend.

Required SST secrets:

- `BetterAuthSecret`
- `ResendApiKey`

Notes:

- Better Auth is mounted on the API under `/auth`
- Mobile sign-in uses Better Auth session cookies, not bearer tokens
- There is currently no wallet provider/signing flow in auth
- The OTP sender address is configured in `infra/config.ts` (`authFromEmail`)

### API SDK generation

API routes are defined with zod schemas via `@hono/zod-openapi`. The OpenAPI
spec is served at `/openapi.json` and a typed fetch SDK is generated into
`packages/api-client` with `@hey-api/openapi-ts`.

After changing API routes or schemas, regenerate the SDK:

```bash
bun run generate:sdk
```

The mobile app consumes the SDK through `apps/mobile/src/services/api/client.ts`,
which wires the base URL and auth cookie.

## Tech Stack

- **Mobile**: Expo, React Native, Better Auth, TanStack Query, generated API SDK
- **API**: Hono + zod OpenAPI, Drizzle ORM, Better Auth, Resend
- **Landing**: Astro, Tailwind CSS
- **Infrastructure**: SST on Cloudflare Workers, Astro, and Hyperdrive

---

## Notes for LLMs / AI Agents

When working on this codebase:

1. **Do NOT run `bun sst dev`** - the user will handle starting the dev server
2. **Do NOT run individual apps** (except mobile) - API and landing require SST
3. **Database migrations**: Only update schema files in `packages/core/db/schema/` or `apps/mobile/src/db/schema/`. Do NOT generate migration files or run migrations - the user will handle that with `drizzle-kit generate` and `drizzle-kit migrate`
4. **Do NOT start any servers** - user handles `sst dev` and `bun start --clear` for mobile
5. **Mobile app**: Can be run independently with `cd apps/mobile && bun dev`, but user handles this
6. **API changes**: After editing API routes/schemas, run `bun run generate:sdk` to refresh the OpenAPI spec and the `packages/api-client` SDK
