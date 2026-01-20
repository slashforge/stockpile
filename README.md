# __NAME__

A template monorepo with mobile app, backend API, and landing page.

## Structure

- `apps/mobile` - Expo React Native app with Privy auth
- `apps/backend` - Hono API backend
- `apps/landing` - Astro landing page
- `packages/core` - Shared database schema and types

## Getting Started

```bash
bun install
```

### Development

```bash
# Run backend + landing (SST-linked apps)
sst dev

# Mobile app (run separately, not SST-linked)
cd apps/mobile
bun start --clear
```

> **Note**: Do not run `apps/backend` or `apps/landing` individually - they depend on SST for secrets and configuration.

## Tech Stack

- **Mobile**: Expo, React Native, Privy Auth, TanStack Query
- **Backend**: Hono, Drizzle ORM
- **Landing**: Astro, Tailwind CSS
- **Infrastructure**: SST (AWS + Cloudflare)

---

## Notes for LLMs / AI Agents

When working on this codebase:

1. **Do NOT run `bun sst dev`** - the user will handle starting the dev server
2. **Do NOT run individual apps** (except mobile) - backend and landing require SST
3. **Database migrations**: Only update schema files in `packages/core/db/schema/` or `apps/mobile/src/db/schema/`. Do NOT generate migration files or run migrations - the user will handle that with `drizzle-kit generate` and `drizzle-kit migrate`
2. **Do NOT start any servers** - user handles `sst dev` and `bun start --clear` for mobile
4. **Mobile app**: Can be run independently with `cd apps/mobile && bun start --clear` but user handles this
4. **Mobile app**: Can be run independently with `cd apps/mobile && bun dev`
