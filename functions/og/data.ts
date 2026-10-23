// Loads card data from the public Newsbid API (no auth) and maps it onto the card inputs. Inputs are only ids
// from the URL path; every rendered field comes from the API, never from the request.
import { bagGradient, type AssetCardInput, type BagCardInput, type CardAsset, CHART_PALETTE } from "./cards";

interface ApiAsset {
  symbol: string;
  name: string;
  weightBps: number;
  issuer: "xstocks" | "prestocks";
  iconUrl: string | null;
  brandColor: string | null;
  market: { usdPrice: number | null; priceChange24hPct: number | null } | null;
}

interface ApiBag {
  id: string;
  title: string;
  subtitle: string;
  sourceType: "editorial" | "disclosure" | "media";
  issuer: "xstocks" | "prestocks";
  curator: { kind: string; name: string };
  tradable: boolean;
  market: { change24hPct: number | null } | null;
  assets: ApiAsset[];
}

interface ApiReturns {
  returns: Record<string, { "1M": number | null; "1Y": number | null; sparkline1M: { t: number; value: number }[] }>;
}

const ICON_TYPES = /^image\/(png|jpe?g|svg\+xml)/;

// Bag returns are daily figures for every bag in one response, and /bags/returns can stall for a minute on a cold
// API isolate. A warm Lambda keeps the last good copy for an hour and serves it stale if a refresh fails.
const RETURNS_TTL_MS = 60 * 60 * 1000;
let returnsCache: { at: number; value: ApiReturns } | null = null;

async function bagReturns(apiUrl: string): Promise<ApiReturns | null> {
  if (returnsCache && Date.now() - returnsCache.at < RETURNS_TTL_MS) return returnsCache.value;
  const fresh = await getJson<ApiReturns>(`${apiUrl}/bags/returns`, 9000);
  if (fresh?.returns) returnsCache = { at: Date.now(), value: fresh };
  return fresh ?? returnsCache?.value ?? null;
}

/** Test hook. */
export function resetDataCache() {
  returnsCache = null;
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Fetch an https logo as a data URI; anything slow, missing or in a format satori can't draw becomes a monogram. */
export async function inlineIcon(url: string | null, timeoutMs = 2500): Promise<string | null> {
  if (!url?.startsWith("https://")) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !ICON_TYPES.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length < 400_000 ? `data:${type.split(";")[0]};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

const company = (name: string) => name.replace(/\s+(xStocks?|PreStocks?|Tokenized.*|Token)$/i, "").trim();
const colorOf = (asset: { brandColor: string | null }, index: number) =>
  asset.brandColor && /^#[0-9a-f]{6}$/i.test(asset.brandColor) ? asset.brandColor : CHART_PALETTE[index % CHART_PALETTE.length]!;

export async function cardAssets(assets: { symbol: string; name: string; weightBps: number; iconUrl: string | null; brandColor: string | null }[], iconLimit = 5): Promise<CardAsset[]> {
  const sorted = [...assets].sort((a, b) => b.weightBps - a.weightBps);
  const icons = await Promise.all(sorted.map((asset, i) => (i < iconLimit ? inlineIcon(asset.iconUrl) : Promise.resolve(null))));
  return sorted.map((asset, i) => ({
    symbol: asset.symbol,
    name: asset.name,
    weightBps: asset.weightBps,
    color: colorOf(asset, i),
    icon: icons[i] ?? null,
  }));
}

/** Downsample to at most `max` points so the sparkline path stays small. */
function downsample(values: number[], max = 40) {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]!);
}

/**
 * `complete` is false when live numbers were missing (a cold API can answer without market data, or time out on
 * returns). The handler still renders, but caches the card briefly so the next fetch picks the numbers up.
 */
export interface Loaded<T> {
  input: T;
  complete: boolean;
}

export async function loadBagCard(apiUrl: string, id: string, publicUrl: string): Promise<Loaded<BagCardInput> | null> {
  const [bagResponse, returns] = await Promise.all([
    getJson<{ bag: ApiBag }>(`${apiUrl}/bags/${encodeURIComponent(id)}`, 9000),
    bagReturns(apiUrl),
  ]);
  const bag = bagResponse?.bag;
  if (!bag) return null;
  const r = returns?.returns?.[bag.id];
  const input: BagCardInput = {
    url: publicUrl,
    title: bag.title,
    subtitle: bag.subtitle,
    issuer: bag.issuer,
    sourceType: bag.sourceType,
    curator: bag.curator.name,
    tradable: bag.tradable && bag.assets.length > 0,
    assets: await cardAssets(bag.assets),
    returns: r ? { m1: r["1M"], y1: r["1Y"], sparkline: downsample(r.sparkline1M.map((p) => p.value)) } : null,
    change24h: bag.market?.change24hPct ?? null,
    gradient: bagGradient(bag),
  };
  const hasMarket = bag.assets.length === 0 || bag.market?.change24hPct != null;
  return { input, complete: hasMarket && returns !== null };
}

export async function loadAssetCard(apiUrl: string, symbol: string, publicUrl: string): Promise<Loaded<AssetCardInput> | null> {
  const list = await getJson<{ bags: ApiBag[] }>(`${apiUrl}/bags`, 12000);
  if (!list) return null;
  const wanted = symbol.toLowerCase();
  const holders = list.bags
    .map((bag) => ({ bag, asset: bag.assets.find((a) => a.symbol.toLowerCase() === wanted) }))
    .filter((entry): entry is { bag: ApiBag; asset: ApiAsset } => !!entry.asset);
  const first = holders[0]?.asset;
  if (!first) return null;
  // Prefer the copy that carries market data.
  const asset = holders.find((entry) => entry.asset.market?.usdPrice != null)?.asset ?? first;
  const input: AssetCardInput = {
    url: publicUrl,
    symbol: asset.symbol,
    company: company(asset.name),
    issuer: asset.issuer,
    // xStocks track the listed share with the same ticker minus the trailing "x".
    underlying: asset.issuer === "xstocks" ? asset.symbol.replace(/x$/, "") : null,
    icon: await inlineIcon(asset.iconUrl),
    color: colorOf(asset, 0),
    price: asset.market?.usdPrice ?? null,
    change24h: asset.market?.priceChange24hPct ?? null,
    bags: holders
      .map(({ bag, asset: held }) => ({ title: bag.title, weightBps: held.weightBps, gradient: bagGradient(bag) }))
      .sort((a, b) => b.weightBps - a.weightBps),
  };
  return { input, complete: input.price !== null };
}
