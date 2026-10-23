// Link previews for the web app. The SPA only ships one index.html, so the router worker (./index.ts) rewrites its
// meta tags per request: shared /bag/<id> and /asset/<symbol> links get their own title, description and a dynamic
// card (rendered by the OG Lambda, functions/og), every other page gets the static default card (/og-image.png).
// No user-agent sniffing: crawlers and browsers get the same HTML, which still boots the app.

/** Bump when the card design changes so platforms refetch (it is part of every og:image URL). */
export const OG_VERSION = "2";

export type SharePage = { kind: "bag"; id: string } | { kind: "asset"; symbol: string } | { kind: "default" };

const BAG_ROUTE = /^\/bag\/([a-z0-9][a-z0-9-]{0,63})\/?$/;
const ASSET_ROUTE = /^\/asset\/([A-Za-z0-9.]{1,24})\/?$/;
export const OG_ROUTE = /^\/og\/(bag\/[a-z0-9][a-z0-9-]{0,63}|asset\/[A-Za-z0-9.]{1,24})\.png$/;

export function sharePage(pathname: string): SharePage {
  const bag = pathname.match(BAG_ROUTE);
  if (bag) return { kind: "bag", id: bag[1]! };
  const asset = pathname.match(ASSET_ROUTE);
  if (asset) return { kind: "asset", symbol: decodeURIComponent(asset[1]!) };
  return { kind: "default" };
}

/** Hour bucket in the image URL: a link shared later gets a fresh card instead of a platform's stale copy. */
export function hourBucket(now: Date) {
  return now.toISOString().slice(0, 13).replace(/\D/g, "");
}

export function cardPath(page: SharePage, now: Date) {
  if (page.kind === "default") return "/og-image.png";
  const path = page.kind === "bag" ? `/og/bag/${page.id}.png` : `/og/asset/${encodeURIComponent(page.symbol)}.png`;
  return `${path}?v=${OG_VERSION}&t=${hourBucket(now)}`;
}

export interface PageMeta {
  title: string;
  description: string;
}

export const DEFAULT_META: PageMeta = {
  title: "Newsbid — Swipe the news. Buy the bag.",
  description: "A news feed where every story is pinned to a bag of tokenized stocks and pre-IPO names. Look inside, then buy the whole bag from your own wallet.",
};

interface ApiBag {
  id: string;
  title: string;
  subtitle: string;
  assets: { symbol: string; name: string; weightBps: number }[];
}

const tokens = (n: number) => `${n} ${n === 1 ? "token" : "tokens"}`;

export function bagMeta(bag: ApiBag): PageMeta {
  const top = [...bag.assets].sort((a, b) => b.weightBps - a.weightBps).slice(0, 3).map((a) => a.symbol);
  const holdings = bag.assets.length ? ` ${tokens(bag.assets.length)}${top.length ? `, led by ${top.join(", ")}` : ""}.` : "";
  return {
    title: `${bag.title} · Newsbid`,
    description: `${bag.subtitle}.${holdings} See every weight, source and risk, then buy the bag in one slide.`,
  };
}

export function assetMeta(symbol: string, bags: ApiBag[]): PageMeta | null {
  const wanted = symbol.toLowerCase();
  const holders = bags.filter((bag) => bag.assets.some((a) => a.symbol.toLowerCase() === wanted));
  const asset = holders[0]?.assets.find((a) => a.symbol.toLowerCase() === wanted);
  if (!asset) return null;
  const company = asset.name.replace(/\s+(xStocks?|PreStocks?)$/i, "");
  const names = holders.slice(0, 3).map((bag) => bag.title).join(", ");
  return {
    title: `${asset.symbol} · ${company} on Newsbid`,
    description: `${company}, held in ${holders.length === 1 ? "the" : `${holders.length}`} Newsbid ${holders.length === 1 ? "bag" : "bags"}: ${names}.`,
  };
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function metaTags(meta: PageMeta, url: string, image: string) {
  const title = escape(meta.title);
  const description = escape(meta.description);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Newsbid" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${escape(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${title}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escape(image)}" />`,
  ].join("\n    ");
}

/** Replace the document's title, description, canonical, og:* and twitter:* tags with `tags`. */
export function injectMeta(html: string, tags: string) {
  const stripped = html
    .replace(/\s*<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta\s+[^>]*(?:name=["'](?:description|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, "")
    .replace(/\s*<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "");
  return stripped.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}
