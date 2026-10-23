// Router worker for app.<host> (infra/web.ts runs it before the static assets).
//  - /og/bag/<id>.png, /og/asset/<symbol>.png: proxy the OG Lambda, cached at the edge.
//  - HTML responses (index.html for every SPA route): per-link preview tags, see ./og.ts.
//  - Everything else: the static build, with the SPA fallback for unknown paths.
import { assetMeta, bagMeta, cardPath, DEFAULT_META, injectMeta, metaTags, OG_ROUTE, type PageMeta, sharePage } from "./og";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** OG Lambda function URL (no trailing slash). */
  OG_ORIGIN: string;
  /** Public API origin, e.g. https://api.newsbid.trade. */
  API_ORIGIN: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;

/** Preview text (titles, holdings; no prices) changes rarely, so it is cached far longer than the cards. */
const META_TTL = 6 * 60 * 60;
/** How long a page view waits for preview text before falling back to the default tags. */
const META_WAIT_MS = 2500;
/** The API can take 10s+ when cold; keep fetching in the background so the next request is warm. */
const META_FETCH_MS = 25_000;

async function ogImage(url: URL, env: Env, ctx: ExecutionContext) {
  const card = url.pathname.match(OG_ROUTE)![1]!;
  const cache = edgeCache();
  const key = url.toString();
  const hit = await cache?.match(key);
  if (hit) return hit;
  try {
    const upstream = await fetch(`${env.OG_ORIGIN}/${card}.png`, { signal: AbortSignal.timeout(15_000) });
    if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/png")) throw new Error(`OG ${upstream.status}`);
    // Cards rendered without live numbers (cold API) are only kept for a minute so the next fetch can fill them in.
    const partial = upstream.headers.get("x-newsbid-og-partial") === "1";
    const response = new Response(upstream.body, {
      headers: { "content-type": "image/png", "cache-control": partial ? "public, max-age=60" : "public, max-age=1800, s-maxage=3600" },
    });
    if (cache) ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  } catch {
    // Unknown bag/asset or a render failure: fall back to the static card, briefly cached.
    return new Response(null, { status: 302, headers: { location: new URL("/og-image.png", url).toString(), "cache-control": "public, max-age=60" } });
  }
}

/**
 * API reads for the preview tags, edge-cached under this host. A miss waits at most META_WAIT_MS; if the API is
 * slower, the fetch keeps running via waitUntil and fills the cache for the next request.
 */
async function apiJson<T>(path: string, origin: string, env: Env, ctx: ExecutionContext): Promise<T | null> {
  const cache = edgeCache();
  const key = `${origin}/__og-meta${path}`;
  try {
    const hit = await cache?.match(key);
    if (hit) return (await hit.json()) as T;
  } catch {
    // A broken cache entry is treated as a miss.
  }

  const load = (async () => {
    const upstream = await fetch(`${env.API_ORIGIN}${path}`, { signal: AbortSignal.timeout(META_FETCH_MS), headers: { accept: "application/json" } });
    if (!upstream.ok) return null;
    const body = await upstream.text();
    if (cache) {
      await cache.put(key, new Response(body, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${META_TTL}` } }));
    }
    return JSON.parse(body) as T;
  })().catch(() => null);
  ctx.waitUntil(load);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), META_WAIT_MS);
  });
  try {
    return await Promise.race([load, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function pageMeta(url: URL, env: Env, ctx: ExecutionContext): Promise<PageMeta> {
  const page = sharePage(url.pathname);
  if (page.kind === "bag") {
    const data = await apiJson<{ bag: Parameters<typeof bagMeta>[0] }>(`/bags/${page.id}`, url.origin, env, ctx);
    return data?.bag ? bagMeta(data.bag) : DEFAULT_META;
  }
  if (page.kind === "asset") {
    const data = await apiJson<{ bags: Parameters<typeof assetMeta>[1] }>("/bags", url.origin, env, ctx);
    return (data && assetMeta(page.symbol, data.bags)) ?? DEFAULT_META;
  }
  return DEFAULT_META;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const read = request.method === "GET" || request.method === "HEAD";

    if (read && OG_ROUTE.test(url.pathname)) return ogImage(url, env, ctx);

    const response = await env.ASSETS.fetch(request);
    if (!read || !response.ok || !response.headers.get("content-type")?.startsWith("text/html")) return response;

    const page = sharePage(url.pathname);
    const meta = await pageMeta(url, env, ctx);
    const canonical = `${url.origin}${url.pathname}`;
    // A bag/asset whose data could not be loaded still gets its own card URL; the proxy falls back if needed.
    const image = new URL(cardPath(page, new Date()), url.origin).toString();
    const html = injectMeta(await response.text(), metaTags(meta, canonical, image));

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("etag");
    headers.set("cache-control", "no-cache");
    return new Response(request.method === "HEAD" ? null : html, { status: response.status, headers });
  },
};
