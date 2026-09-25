# Mobile (`apps/mobile`, `@stackforge/mobile`)

Expo SDK 56 / React Native 0.85 app with Expo Router, TanStack Query, Better Auth (email OTP), React Native Unistyles, and a local SQLite db via `expo-sqlite` + Drizzle.

## Hard rules

- Do NOT start dev servers (`expo start`, `bun dev`) — user handles it.
- Edit schemas in `src/db/schema/`, then generate and apply migrations as needed (see `.agents/database.md`). Do not hand-edit generated files in `apps/mobile/drizzle/`.
- New native modules require a dev-client rebuild — flag this to the user instead of assuming it works.

## Layout

```
app/                      Expo Router screens/layouts; (app)/ group is the authed area with tabs
app/_layout.tsx           Root layout + providers
app.config.ts             Expo config; scheme varies by EXPO_PUBLIC_ENV (stackforge|dev|beta|prod), EAS profiles in eas.json
src/components/ui|molecules|pages   UI primitives → composed components → screens
src/hooks/                use-auth.ts (Better Auth session), use-user.ts, use-sonner.ts, ...
src/providers/            root-provider.tsx composes query/theme/sonner/network providers
src/services/api/client.ts  Configures @stackforge/api-client: baseUrl + Cookie interceptor from authClient
src/lib/auth-client.ts    Better Auth Expo client, exports API_URL
src/db/                   Local SQLite (drizzle, dialect sqlite, driver expo) — separate from server Postgres
src/config/theme.ts, src/utils/unistyles.ts   Theme + Unistyles setup
polyfills/, metro.config.js, babel.config.js  Crypto/streams polyfills for Solana/viem deps — do not remove casually
```

## Conventions

- Styling: React Native Unistyles (`src/utils/unistyles.ts`, `src/config/theme.ts`) — not StyleSheet-only, not NativeWind.
- API access: import from `src/services/api/client.ts` (re-exports the generated SDK). Never fetch the API directly; auth relies on the cookie interceptor.
- Auth flow: `src/hooks/use-auth.ts` + `src/lib/auth-client.ts`; session cookies persisted via `src/services/auth-storage.ts` (SecureStore).
- Server state via TanStack Query (`src/providers/query-provider.tsx`); follow existing hook patterns in `src/hooks/`.
- Path alias `@/` → `src/` (see tsconfig).
- Lint: `bun run lint` (expo lint / eslint-config-expo).

## Interaction with other layers

- API changes upstream → regenerate SDK (`bun run generate:sdk` at root) before consuming new endpoints.
- `EXPO_PUBLIC_API_URL` is injected by the SST `Expo` DevCommand (`infra/expo.ts`); defaults to `http://localhost:4040`.
