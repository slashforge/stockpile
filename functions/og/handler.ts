// Dynamic OG cards for shared web-app links, served from a Lambda function URL (infra/og.ts).
//   GET /bag/<id>.png        bag card: holdings, weights, 1M bag-index return + sparkline, 24h move
//   GET /asset/<symbol>.png  token card: price, 24h move and the bags that hold it
// Only ids come from the URL; card content is loaded from the public API. The web app's router worker
// (apps/web/worker) proxies these under app.<host>/og/* and caches them at the edge.
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { AssetCard, BagCard } from "./cards";
import { loadAssetCard, loadBagCard } from "./data";
import { renderPng } from "./render";

export interface OgEnv {
  apiUrl: string;
  /** Host shown on the card, e.g. app.newsbid.trade. */
  appHost: string;
}

export interface OgResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

const BAG_PATH = /^\/bag\/([a-z0-9][a-z0-9-]{0,63})\.png$/;
const ASSET_PATH = /^\/asset\/([A-Za-z0-9.]{1,24})\.png$/;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 64;
const cache = new Map<string, { png: Buffer; at: number }>();

const PNG_HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=1800" };
// Rendered without live numbers (cold API): let caches retry soon. The router worker keys off this header too.
const PARTIAL_HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=60", "x-newsbid-og-partial": "1" };
const notFound = (message: string): OgResult => ({ status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" }, body: message });

async function render(path: string, env: OgEnv): Promise<{ png: Buffer; complete: boolean } | null> {
  const bag = path.match(BAG_PATH);
  if (bag) {
    const id = bag[1]!;
    const loaded = await loadBagCard(env.apiUrl, id, `${env.appHost}/bag/${id}`);
    return loaded ? { png: await renderPng(BagCard(loaded.input)), complete: loaded.complete } : null;
  }
  const asset = path.match(ASSET_PATH);
  if (asset) {
    const symbol = asset[1]!;
    const loaded = await loadAssetCard(env.apiUrl, symbol, `${env.appHost}/asset/${symbol}`);
    return loaded ? { png: await renderPng(AssetCard(loaded.input)), complete: loaded.complete } : null;
  }
  return null;
}

export async function renderRoute(path: string, env: OgEnv): Promise<OgResult> {
  if (!BAG_PATH.test(path) && !ASSET_PATH.test(path)) return notFound("Unknown card");
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    cache.delete(path);
    cache.set(path, hit);
    return { status: 200, headers: { ...PNG_HEADERS, "x-newsbid-og-cache": "hit" }, body: hit.png };
  }
  const rendered = await render(path, env);
  if (!rendered) return notFound("Not found");
  const { png, complete } = rendered;
  if (!complete) return { status: 200, headers: { ...PARTIAL_HEADERS, "x-newsbid-og-cache": "miss" }, body: png };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(path, { png, at: Date.now() });
  return { status: 200, headers: { ...PNG_HEADERS, "x-newsbid-og-cache": "miss" }, body: png };
}

export function envFromProcess(): OgEnv {
  return {
    apiUrl: (process.env.API_URL ?? "http://localhost:4040").replace(/\/$/, ""),
    appHost: process.env.APP_HOST ?? "app.newsbid.trade",
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const result = await renderRoute(event.rawPath, envFromProcess());
    const binary = typeof result.body !== "string";
    return {
      statusCode: result.status,
      headers: result.headers,
      body: binary ? (result.body as Buffer).toString("base64") : (result.body as string),
      isBase64Encoded: binary,
    };
  } catch (error) {
    console.error("[og] render failed", event.rawPath, error);
    return { statusCode: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, body: "Render failed" };
  }
}
