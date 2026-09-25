# Stockpile landing (`apps/landing`)

Astro 6 + Tailwind 3 marketing site for [stockpile.cash](https://stockpile.cash), deployed to Cloudflare via
`@astrojs/cloudflare` (see `infra/landing.ts`). Includes an MDX blog and satori-rendered OG images.

## Structure

```
src/pages/index.astro         Landing page (Hero, HowItWorks, Bags, Receipts, Builders, Footer)
src/components/               Sections + TokenAvatar / BagCard / PhoneMock / StoreBadges
src/lib/bags.ts               Bag catalogue: live from the API at build time, static fallback otherwise
src/pages/blog/, src/content  Blog (Markdown/MDX), config in src/content.config.ts
src/pages/og/[...path].svg.ts OG image route (og-image-renderer.mjs + og-image-options.mjs)
src/consts.ts                 Site title/description/URL, GitHub link
tailwind.config.mjs           Design tokens mirrored from apps/mobile `theme.ds` (bright, cool palette)
scripts/                      Dev-only helpers (headless Chrome screenshots / overflow check)
```

## Bag catalogue

`src/lib/bags.ts` fetches `GET /bags` from `LANDING_API_URL` (default `http://localhost:4040`) during
`astro build`. Only composition metadata (title, curator, holdings, editorial weights, logos, brand colours) is
rendered; prices and performance are never shown. If the API is unreachable the page uses the static snapshot in
the same file and labels the section accordingly. Token logos come from the issuers (`xstocks-metadata.backed.fi`,
`prestocks.com`) and fall back to a ticker monogram.

## Commands

```bash
bun run build      # astro build (fetches bags from the API if reachable)
bun run preview    # serve dist/ on http://localhost:4321 (restart after rebuilding)
bunx tsc --noEmit  # typecheck
```

Do not run `bun dev` standalone in the monorepo; the site is normally served through SST (`.agents/infra.md`).

## OG images

`/og/<path>.svg` renders the page's `og:title`/`og:description` with satori. The renderer can be exercised
directly under Bun (`og-image-renderer.mjs` + `satori`); `astro preview`'s local workerd sandbox refuses satori's
runtime WASM compile ("Wasm code generation disallowed by embedder"), so that route returns 500 in preview.
