# Database

Two independent Drizzle setups. Never generate or run migrations for either — schema file edits only; the user runs `drizzle-kit generate`/`migrate`.

## 1. Server Postgres (`packages/core`)

- Schema: `packages/core/db/schema/` — `users.ts`, `auth.ts` (Better Auth tables: user/session/account/verification), `id.ts` (nanoid id helper), re-exported by `index.ts`.
- Client: `packages/core/db/index.ts` exports `db` — a lazy Proxy around `drizzle(node-postgres)`. Connection resolution order: linked Hyperdrive binding (`Resource.Database`, deployed Workers) → `DatabaseUrl` secret (local/`sst shell`) → assembled from `DatabaseHost`/`DatabaseUsername`/`DatabasePassword` secrets. Each query opens/closes a fresh `pg.Client` (Workers-safe). Preserve this pattern; do not introduce long-lived pools.
- Root `drizzle.config.ts`: dialect `postgresql`, schema `./packages/core/db/schema`, credentials from `Resource.DatabaseUrl` (so drizzle-kit must run under SST, e.g. `sst shell` — user's job).
- Package exports: `@stackforge/core/db` (client) and `@stackforge/core/db/schema` (tables). Import schema tables from the schema export, not deep paths.
- Drizzle Studio is registered as an SST DevCommand (`infra/orm.ts`).

## 2. Mobile SQLite (`apps/mobile/src/db`)

- Schema: `apps/mobile/src/db/schema/` (`users.ts`, `wallets.ts`); config `apps/mobile/drizzle.config.ts` (dialect `sqlite`, driver `expo`, out `./drizzle`).
- `apps/mobile/drizzle/` is generated output — never edit.
- This is a local cache/store, unrelated to server Postgres. Do not share types between the two schemas unless done deliberately.

## Changing server schema — checklist

1. Edit/add table files in `packages/core/db/schema/`, export from `schema/index.ts`.
2. Do NOT run drizzle-kit. Tell the user a migration is needed.
3. Better Auth tables (`auth.ts`) map to the Better Auth drizzle adapter (`apps/api/src/lib/auth.ts`) — renaming them breaks auth.
4. Update API routes/schemas that surface the change, then `bun run generate:sdk` (see `.agents/api.md`).
