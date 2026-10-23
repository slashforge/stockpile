# OG cards (`functions/og`)

Open Graph images (1200x630 PNG) for the landing site and the web app, in the landing page's editorial look:
newsprint paper, a masthead with a double rule, Newsreader headlines, JetBrains Mono labels, brand blue. Rendered
with `satori` (element tree -> SVG) and `@resvg/resvg-js` (SVG -> PNG). Fonts are static TTF instances from Google
Fonts (SIL OFL, `fonts/LICENSE.txt`), shipped with the code; nothing is fetched at render time except token logos.

## Static vs dynamic

| Link | Card | When it renders |
| --- | --- | --- |
| Landing pages (`/`, `/blog/*`, legal) | `HomeCard`, `PageCard` | Build time. `apps/landing/scripts/og.ts` runs after `astro build`, reads each prerendered page's `og:title` / `og:description` and writes `dist/client/og/<page>.png` |
| Web app default (`/`, `/bags`, ...) | `HomeCard` | Committed `apps/web/public/og-image.png` (`bun run --cwd functions og:static`) |
| Web `/bag/<id>` | `BagCard` | On request: holdings, weights, 1M bag-index return + sparkline, 24h move |
| Web `/asset/<symbol>` | `AssetCard` | On request: price, 24h move, the bags that hold it |

Only bag and asset links need live data, so only they hit the Lambda.

## Dynamic path

```
crawler -> app.<host>/bag/<id>                 router worker (apps/web/worker): index.html with per-link title,
                                               description and og:image = /og/bag/<id>.png?v=<OG_VERSION>&t=<hour>
crawler -> app.<host>/og/bag/<id>.png          router worker: edge cache (caches.default) or ->
           <OG Lambda URL>/bag/<id>.png        handler.ts: loads /bags/<id> + /bags/returns from the API, renders
```

- The Lambda only takes ids from the path; all card content comes from the public API. Unknown ids 404, and the
  worker then 302s to the static `/og-image.png`.
- The hour bucket in the image URL means a link shared later gets fresh numbers instead of a platform's stale copy.
  Bump `OG_VERSION` in `apps/web/worker/og.ts` after changing the card design.
- A warm Lambda keeps the last 64 renders for 10 minutes; the worker caches PNGs for an hour at the edge.
- The API is slow when cold (`/bags` ~8 s, `/bags/returns` can stall for a minute on a fresh isolate). A card
  rendered without live numbers is sent with `x-newsbid-og-partial: 1` and `max-age=60`: it is not memory-cached
  and the worker edge-caches it for a minute only, so the next fetch fills the numbers in. The Lambda keeps the
  last good `/bags/returns` (daily data) for an hour and serves it stale if a refresh fails.
- Preview text (titles, holdings) waits at most 2.5 s per page view; a slower API read keeps running in the
  background and is edge-cached for 6 h, so the next view of that link gets the specific tags.

`infra/og.ts`: `sst.aws.Function` (nodejs22.x, x86_64, function URL; `@resvg/resvg-js` + the linux binary installed
next to the bundle, `fonts/` copied to `./fonts`) on deployed stages. Locally it is a `DevCommand` running
`serve.ts` on :4500 against the local API.

## Files

- `cards.ts` - card templates and building blocks (plain element objects, no React)
- `render.ts` - fonts + satori/resvg
- `data.ts` - API reads and logo inlining (logos that are slow, missing or not PNG/JPEG/SVG become monograms)
- `handler.ts` - Lambda handler and `renderRoute` (shared with `serve.ts`); `handler.test.ts`
- `preview.ts` - writes every card with fixture data: `bun run --cwd functions og:preview [outDir]`
- `static.ts` - writes the web app's default card

```sh
bun run --cwd functions og:preview /tmp/og    # design review
bun run --cwd functions og:serve              # http://localhost:4500/bag/ai-infrastructure.png (needs the API on :4040)
bun test functions/og apps/web/tests/og-worker.test.ts
```
