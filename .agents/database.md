# Database

Two independent Drizzle setups. Agents may generate and run migrations using the relevant Drizzle configuration. Confirm the target database and review generated SQL before applying migrations; ask before destructive changes or migrations against shared or production databases.

## 1. Server Postgres (`packages/core`)

- Schema: `packages/core/db/schema/` — `users.ts`, `auth.ts` (Better Auth tables: user/session/account/verification), `id.ts` (nanoid id helper), re-exported by `index.ts`.
- Client: `packages/core/db/index.ts` exports `db` — a lazy Proxy around `drizzle(node-postgres)`. Connection resolution order: linked Hyperdrive binding (`Resource.Database`, deployed Workers) → `DatabaseUrl` secret (local/`sst shell`). Hyperdrive's origin is parsed from `DatabaseUrl` in `infra/database.ts`. Each query opens/closes a fresh `pg.Client` (Workers-safe). Preserve this pattern; do not introduce long-lived pools.
- Root `drizzle.config.ts`: dialect `postgresql`, schema `./packages/core/db/schema`. Reads `Resource.DatabaseUrl`, so run drizzle-kit via the root `db:generate` / `db:migrate` scripts (wrapped in `sst shell`).
- Package exports: `@stackforge/core/db` (client) and `@stackforge/core/db/schema` (tables). Import schema tables from the schema export, not deep paths.
- Drizzle Studio is registered as an SST DevCommand (`infra/orm.ts`).

## 2. Mobile SQLite (`apps/mobile/src/db`)

- Schema: `apps/mobile/src/db/schema/` (`users.ts`, `wallets.ts`); config `apps/mobile/drizzle.config.ts` (dialect `sqlite`, driver `expo`, out `./drizzle`).
- `apps/mobile/drizzle/` is generated output — regenerate with Drizzle rather than hand-editing.
- This is a local cache/store, unrelated to server Postgres. Do not share types between the two schemas unless done deliberately.

## Changing server schema — checklist

1. Edit/add table files in `packages/core/db/schema/`, export from `schema/index.ts`.
2. Generate the migration with Drizzle, review its SQL, and apply it to the intended local database. Ask before destructive changes or applying to shared or production databases.
3. Better Auth tables (`auth.ts`) map to the Better Auth drizzle adapter (`apps/api/src/lib/auth.ts`) — renaming them breaks auth.
4. Update API routes/schemas that surface the change, then `bun run generate:sdk` (see `.agents/api.md`).
