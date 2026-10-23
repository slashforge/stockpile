# Newsbid landing (`apps/landing`)

Astro 6 + Tailwind 3 marketing site for [newsbid.trade](https://newsbid.trade), deployed to Cloudflare via
`@astrojs/cloudflare` (see `infra/landing.ts`). Includes an MDX blog and build-time OG images.

## Structure

```
src/pages/index.astro         Landing page: composes the sections in src/components/home
src/components/home/          Hero, Tape, FrontPage (+ PinnedBag), Tour, BagDesk, FinePrint, Faq, Closing
src/components/               Nav, Footer, BaseHead, IPhone frame, TokenAvatar; app/ holds small app-UI twins
src/lib/bags.ts               Bag catalogue: live from the API at build time, static fallback otherwise
src/pages/blog/, src/content  Blog (Markdown/MDX), config in src/content.config.ts
src/lib/og-image.ts           Page path -> /og/<page>.png (used by BaseHead and scripts/og.ts)
src/consts.ts                 Site title/description/URL, GitHub link
tailwind.config.mjs           Design tokens: app palette (apps/mobile `theme.ds`) + editorial paper/ink
src/styles/home.css           Home page primitives (Newsreader serif, JetBrains Mono kickers, buttons)
scripts/og.ts                 Post-build OG cards for every prerendered page
scripts/                      Plus dev-only helpers (headless Chrome screenshots / overflow check)
```

## Bag catalogue

`src/lib/bags.ts` fetches `GET /bags` from `LANDING_API_URL` (default `http://localhost:4040`) during
`astro build`. Only composition metadata (title, curator, holdings, editorial weights, logos, brand colours) is
rendered; prices and performance are never shown. If the API is unreachable the page uses the static snapshot in
the same file and labels the section accordingly. Token logos come from the issuers (`xstocks-metadata.backed.fi`,
`prestocks.com`) and fall back to a ticker monogram.

## Commands

```bash
bun run build      # astro build (fetches bags from the API if reachable), then scripts/og.ts
bun run preview    # serve dist/ on http://localhost:4321 (restart after rebuilding)
bunx tsc --noEmit  # typecheck
```

Do not run `bun dev` standalone in the monorepo; the site is normally served through SST (`.agents/infra.md`).

## OG images

Static PNGs, rendered after `astro build` by `scripts/og.ts`: it reads each prerendered page's `og:title` /
`og:description` (and `article:published_time` for posts) from `dist/client/**/*.html` and writes
`dist/client/og/<page>.png`, which `BaseHead` points `og:image` at. New pages and posts get a card automatically.
The card templates live in `functions/og` and are shared with the web app (see `functions/og/README.md`). They
don't exist under `astro dev`; run `bun run build` to see them.
