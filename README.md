# StackForge

A template monorepo with mobile app, backend API, and landing page.

## Structure

- `apps/mobile` - Expo React Native app with Better Auth email OTP
- `apps/api` - Hono API backend
- `apps/landing` - Astro landing page
- `packages/core` - Shared database schema and types

## Getting Started

```bash
bun install
```

### Development

```bash
# Run API + landing (SST-linked apps)
sst dev

# Mobile app (run separately, not SST-linked)
cd apps/mobile
bun start --clear
```

> **Note**: Do not run `apps/api` or `apps/landing` individually - they depend on SST for secrets and configuration.

### Auth setup

Email sign-in uses Better Auth with email OTPs delivered by Resend.

Required SST secrets:

- `BetterAuthSecret`
- `ResendApiKey`

Optional env for the API worker:

- `BETTER_AUTH_FROM_EMAIL` - sender address for OTP emails

Notes:

- Better Auth is mounted on the API under `/auth`
- Mobile sign-in uses Better Auth session cookies, not bearer tokens
- There is currently no wallet provider/signing flow in auth

## Tech Stack

- **Mobile**: Expo, React Native, Better Auth, TanStack Query
- **API**: Hono, Drizzle ORM, Better Auth, Resend
- **Landing**: Astro, Tailwind CSS
- **Infrastructure**: SST (AWS + Cloudflare)

---

## Notes for LLMs / AI Agents

When working on this codebase:

1. **Do NOT run `bun sst dev`** - the user will handle starting the dev server
2. **Do NOT run individual apps** (except mobile) - API and landing require SST
3. **Database migrations**: Only update schema files in `packages/core/db/schema/` or `apps/mobile/src/db/schema/`. Do NOT generate migration files or run migrations - the user will handle that with `drizzle-kit generate` and `drizzle-kit migrate`
4. **Do NOT start any servers** - user handles `sst dev` and `bun start --clear` for mobile
5. **Mobile app**: Can be run independently with `cd apps/mobile && bun dev`, but user handles this
