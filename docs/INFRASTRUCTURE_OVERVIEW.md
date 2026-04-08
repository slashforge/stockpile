# Infrastructure Overview

A visual guide to our tech stack for non-technical stakeholders.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SST (Orchestrator)                              │
│                     "The control center that manages everything"             │
│                                                                              │
│   ┌─────────────────────────────────┐   ┌─────────────────────────────────┐ │
│   │            AWS                   │   │          CLOUDFLARE             │ │
│   │    "Traditional hosting"         │   │      "Edge/fast hosting"        │ │
│   │                                  │   │                                 │ │
│   │  ┌────────────────────────────┐ │   │  ┌───────────────────────────┐  │ │
│   │  │      Landing Page          │ │   │  │       Backend API         │  │ │
│   │  │        (Astro)             │ │   │  │        (Hono)             │  │ │
│   │  │                            │ │   │  │                           │  │ │
│   │  │  • Marketing website       │ │   │  │  • Runs globally (fast!)  │  │ │
│   │  │  • yoursite.com            │ │   │  │  • api.yoursite.com       │  │ │
│   │  │  • Auto-scales             │ │   │  │  • Handles all data       │  │ │
│   │  └────────────────────────────┘ │   │  └───────────────────────────┘  │ │
│   │                                  │   │               │                 │ │
│   │  ┌────────────────────────────┐ │   │               │                 │ │
│   │  │      DNS Management        │ │   │               ▼                 │ │
│   │  │   (Route 53 / Domains)     │ │   │  ┌───────────────────────────┐  │ │
│   │  └────────────────────────────┘ │   │  │      DNS (Cloudflare)     │  │ │
│   │                                  │   │  │   Fast global routing     │  │ │
│   └─────────────────────────────────┘   │  └───────────────────────────┘  │ │
│                                          └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │      PlanetScale Postgres       │
                    │         (Database)              │
                    │                                 │
                    │  • Serverless (auto-scales)     │
                    │  • Uses Neon driver for CF      │
                    │  • Separate DB per environment  │
                    └─────────────────────────────────┘
```

---

## What SST Does

**SST (Serverless Stack)** is our deployment tool. Think of it as the "manager" that:

```
┌──────────────────────────────────────────────────────────────┐
│                         SST                                   │
│                                                               │
│   1. DEFINES what we need                                     │
│      └── "I need an API, a landing page, and a database"      │
│                                                               │
│   2. PROVISIONS resources                                     │
│      └── Creates them on AWS + Cloudflare automatically       │
│                                                               │
│   3. CONNECTS everything                                      │
│      └── Sets up domains, links secrets, wires services       │
│                                                               │
│   4. MANAGES environments                                     │
│      └── Keeps dev/staging/prod separate but consistent       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Multi-Environment Architecture

We run **three separate environments**, each completely isolated:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENVIRONMENTS                                       │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│        DEV          │        BETA         │           PROD                  │
│   (Development)     │   (Testing/QA)      │       (Production)              │
├─────────────────────┼─────────────────────┼─────────────────────────────────┤
│                     │                     │                                 │
│  dev.yoursite.com   │  beta.yoursite.com  │  yoursite.com                   │
│  dev.api.yoursite   │  beta.api.yoursite  │  api.yoursite.com               │
│                     │                     │                                 │
│  ┌───────────────┐  │  ┌───────────────┐  │  ┌───────────────┐              │
│  │   Own API     │  │  │   Own API     │  │  │   Own API     │              │
│  │   Instance    │  │  │   Instance    │  │  │   Instance    │              │
│  └───────┬───────┘  │  └───────┬───────┘  │  └───────┬───────┘              │
│          │          │          │          │          │                      │
│          ▼          │          ▼          │          ▼                      │
│  ┌───────────────┐  │  ┌───────────────┐  │  ┌───────────────┐              │
│  │  Own Database │  │  │  Own Database │  │  │  Own Database │              │
│  │   (Dev DB)    │  │  │  (Beta DB)    │  │  │  (Prod DB)    │              │
│  └───────────────┘  │  └───────────────┘  │  └───────────────┘              │
│                     │                     │                                 │
│  WHO: Engineers     │  WHO: QA/Internal   │  WHO: Real Users                │
│  RISK: Low          │  RISK: Medium       │  RISK: High (protected)         │
│                     │                     │                                 │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘
```

---

## Secrets Management

Secrets (passwords, API keys, etc.) are managed by SST with **environment isolation** and **fallback support**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SST SECRETS SYSTEM                                    │
│                                                                              │
│   How it works:                                                              │
│   ─────────────                                                              │
│                                                                              │
│   1. Secrets are stored securely (encrypted)                                 │
│   2. Each environment can have its OWN value                                 │
│   3. If not set for an env, it FALLS BACK to a shared default               │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         Example: DATABASE_URL                        │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   PROD  ──────►  prod-database.planetscale.com  ✓ (own value)       │   │
│   │                                                                      │   │
│   │   BETA  ──────►  beta-database.planetscale.com  ✓ (own value)       │   │
│   │                                                                      │   │
│   │   DEV   ──────►  dev-database.planetscale.com   ✓ (own value)       │   │
│   │                                                                      │   │
│   │   NEW   ──────►  (no value set) ──► falls back to DEV value         │   │
│   │   STAGE                                                              │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Secrets we manage:                                                         │
│   ┌──────────────────────┬─────────────────────────────────────────────┐    │
│   │  DatabaseUrl         │  Connection string to PlanetScale           │    │
│   │  DatabaseHost        │  Database server address                    │    │
│   │  DatabaseUsername    │  Database login                             │    │
│   │  DatabasePassword    │  Database password                          │    │
│   └──────────────────────┴─────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Why This Split? (AWS vs Cloudflare)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   AWS (Amazon Web Services)              CLOUDFLARE                          │
│   ─────────────────────────              ──────────                          │
│                                                                              │
│   BEST FOR:                              BEST FOR:                           │
│   • Static websites                      • APIs that need speed              │
│   • Complex infrastructure               • Global low-latency                │
│   • Long-running processes               • Edge computing                    │
│                                                                              │
│   WE USE FOR:                            WE USE FOR:                         │
│   ✓ Landing page (Astro)                 ✓ Backend API (Hono)                │
│   ✓ DNS management                       ✓ DNS routing                       │
│   ✓ SSL certificates                     ✓ DDoS protection                   │
│                                                                              │
│   WHY:                                   WHY:                                │
│   Landing page doesn't need              API calls from mobile/web           │
│   ultra-low latency, just                need to be FAST from                │
│   reliability and caching                anywhere in the world               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Client Applications (Not Managed by SST)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPS                                           │
│              (These connect TO our infrastructure)                           │
│                                                                              │
│   ┌─────────────────────────┐        ┌─────────────────────────┐            │
│   │      MOBILE APP         │        │        WEB APP          │            │
│   │    (Expo/React Native)  │        │     (Vite + React)      │            │
│   │                         │        │                         │            │
│   │  • iOS + Android        │        │  • Already built        │            │
│   │  • App Store / Play     │        │  • app.yoursite.com     │            │
│   │  • Built with Expo      │        │  • Hosted separately    │            │
│   │                         │        │                         │            │
│   └───────────┬─────────────┘        └───────────┬─────────────┘            │
│               │                                  │                          │
│               └──────────────┬───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │   Backend API       │                                  │
│                    │ (api.yoursite.com)  │                                  │
│                    └─────────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication

- **Provider**: Better Auth
- **Sign-in method**: Email OTP
- **Email delivery**: Resend
- **API mount path**: `/auth`
- **Client auth mechanism**: Better Auth session cookies
- **Secrets managed by SST**: `BetterAuthSecret`, `ResendApiKey`
- **Wallets**: not part of the authentication flow

---

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPLOYMENT PIPELINE                                  │
│                                                                              │
│                                                                              │
│    ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────┐           │
│    │  Code   │      │  Push   │      │   SST   │      │  Live   │           │
│    │ Change  │ ───► │ to Git  │ ───► │ Deploy  │ ───► │   🎉    │           │
│    └─────────┘      └─────────┘      └─────────┘      └─────────┘           │
│                                            │                                 │
│                                            ▼                                 │
│                          ┌─────────────────────────────────┐                │
│                          │  SST automatically:             │                │
│                          │                                 │                │
│                          │  • Builds the code              │                │
│                          │  • Updates AWS resources        │                │
│                          │  • Updates Cloudflare workers   │                │
│                          │  • Connects secrets             │                │
│                          │  • Updates DNS if needed        │                │
│                          └─────────────────────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Orchestration** | SST | Manages all infrastructure as code |
| **API Hosting** | Cloudflare Workers | Fast, global API |
| **Web Hosting** | AWS (Astro) | Landing page |
| **Database** | PlanetScale Postgres | Data storage |
| **Database Driver** | Neon Serverless | Cloudflare-compatible DB client |
| **ORM** | Drizzle | Type-safe database queries |
| **Mobile** | Expo / React Native | iOS + Android app |
| **Web App** | Vite + React | Browser app (pre-built) |

---

## Key Benefits

| Benefit | How We Achieve It |
|---------|------------------|
| **Fast globally** | API on Cloudflare edge (200+ locations) |
| **Auto-scales** | Serverless = no capacity planning |
| **Cost-effective** | Pay per request, not idle servers |
| **Safe deployments** | Separate dev/beta/prod environments |
| **Secure secrets** | SST encrypts and manages per-environment |
| **One codebase** | Mobile: iOS + Android from same code |

---

## Questions?

Contact the engineering team for technical deep-dives.
