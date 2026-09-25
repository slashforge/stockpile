// Chart series for the mobile app, built from tokens.xyz candles (the same source riven-cash charts use). Ranges follow riven's
// period mapping: 1D -> 15m candles over 24h, 1W -> 1H over 7d, 1M -> 4H over 30d, ALL -> 1D candles. Riven sends ALL without a window,
// but tokens.xyz then returns only the last few days (verified live), so ALL asks for two years explicitly. Every endpoint
// fails soft: without TOKENS_API_KEY (or when the provider is down / a mint is unknown) the response is 200 with empty points and a
// typed `reason`, never a 500, so the client can simply hide the chart. `/bags/{id}/history` (snapshot fallback) stays as-is.
import { bagAssets, bags, resolveAsset, type Bag } from "./bags";
import { candlesFor, type Candle, type TokensFailure, type TokensInterval } from "./tokens-api";

export const chartRanges = ["1D", "1W", "1M", "ALL"] as const;
export type ChartRange = (typeof chartRanges)[number];
export const CHART_SOURCE = "tokens.xyz" as const;
export const chartReasons = ["unconfigured", "unresolved", "unavailable", "not_tradable", "insufficient_data"] as const;
export type ChartReason = (typeof chartReasons)[number];
export type PricePoint = { t: number; close: number };
export type IndexPoint = { t: number; value: number };
export type AssetChart = { mint: string; symbol: string | null; range: ChartRange; interval: TokensInterval; points: PricePoint[]; candles: Candle[]; change: { abs: number; pct: number } | null; source: typeof CHART_SOURCE; reason: ChartReason | null; asOf: string | null };
export type ChartLeg = { mint: string | null; symbol: string; weight: number; weightBps: number; change: { pct: number } | null; ok: boolean; reason: ChartReason | null };
export type BagChart = { bagId: string; range: ChartRange; interval: TokensInterval; points: IndexPoint[]; change: { pct: number } | null; legs: ChartLeg[]; source: typeof CHART_SOURCE; reason: ChartReason | null; asOf: string | null };
export type Sparklines = { range: "1D"; interval: "1H"; source: typeof CHART_SOURCE; reason: ChartReason | null; sparklines: Record<string, IndexPoint[]> };

export const rangeConfig: Record<ChartRange, { interval: TokensInterval; seconds: number }> = { "1D": { interval: "15m", seconds: 86400 }, "1W": { interval: "1H", seconds: 7 * 86400 }, "1M": { interval: "4H", seconds: 30 * 86400 }, ALL: { interval: "1D", seconds: 2 * 365 * 86400 } };
export const intervalSeconds: Record<TokensInterval, number> = { "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 7 * 86400 };
const bagChartTtl = 60_000, sparklineTtl = 5 * 60_000;
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;
const pct = (first: number, last: number) => round((last / first - 1) * 100);

type Window = { from: number; to: number };
function windowFor(range: ChartRange, now: Date): Window {
  const to = Math.floor(now.getTime() / 1000);
  return { from: to - rangeConfig[range].seconds, to };
}

/** Small TTL memo with in-flight de-duplication (bag charts 60s, sparklines 5 min). Reset by `resetChartCache`. */
const memoCache = new Map<string, { expiresAt: number; value?: unknown; pending?: Promise<unknown> }>();
async function memo<T>(key: string, ttl: number, compute: () => Promise<T>): Promise<T> {
  const entry = memoCache.get(key);
  if (entry && entry.expiresAt > Date.now() && entry.value !== undefined) return entry.value as T;
  if (entry?.pending) return entry.pending as Promise<T>;
  const pending = compute().then((value) => { memoCache.set(key, { expiresAt: Date.now() + ttl, value }); return value; }, (error) => { memoCache.delete(key); throw error; });
  memoCache.set(key, { expiresAt: 0, pending });
  return pending;
}
export function resetChartCache() { memoCache.clear(); }

async function seriesFor(mint: string, interval: TokensInterval, window: Window): Promise<{ candles: Candle[]; reason: ChartReason | null }> {
  const result = await candlesFor(mint, interval, window.from, window.to);
  if (!result.ok) return { candles: [], reason: result.reason satisfies TokensFailure };
  return result.candles.length >= 2 ? { candles: result.candles, reason: null } : { candles: result.candles, reason: "insufficient_data" };
}

/** One asset's chart: points are candle closes (asc, t > 0, close > 0 by construction); change is first -> last close. */
export async function assetChart(mint: string, symbol: string | null, range: ChartRange, now = new Date()): Promise<AssetChart> {
  const { interval } = rangeConfig[range];
  const { candles, reason } = await seriesFor(mint, interval, windowFor(range, now));
  const first = candles[0], last = candles[candles.length - 1];
  return { mint, symbol, range, interval, points: candles.map((candle) => ({ t: candle.t, close: candle.c })), candles,
    change: first && last && candles.length >= 2 && first.c > 0 ? { abs: round(last.c - first.c, 6), pct: pct(first.c, last.c) } : null,
    source: CHART_SOURCE, reason, asOf: last ? new Date(last.t * 1000).toISOString() : null };
}

type LegSeries = { weightBps: number; candles: Candle[] };
/**
 * Weight-normalised bag index from per-leg closes. Closes are bucketed to the interval; each leg is normalised to 100 at its own first
 * close and forward-filled through later gaps (before its first close it counts as missing and contributes flat 100). Buckets missing
 * more than one leg are dropped. The index is the weighted sum (weights renormalised over the legs given); base 100 at the first bucket.
 */
export function bagIndex(legs: LegSeries[], interval: TokensInterval): IndexPoint[] {
  const usable = legs.filter((leg) => leg.candles.length && leg.weightBps > 0);
  if (!usable.length) return [];
  const step = intervalSeconds[interval];
  const total = usable.reduce((sum, leg) => sum + leg.weightBps, 0);
  const maps = usable.map((leg) => { const map = new Map<number, number>(); for (const candle of leg.candles) map.set(Math.floor(candle.t / step) * step, candle.c); return map; });
  const buckets = [...new Set(maps.flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);
  const last: (number | null)[] = usable.map(() => null), base: (number | null)[] = usable.map(() => null);
  const points: IndexPoint[] = [];
  for (const t of buckets) {
    let missing = 0, value = 0;
    usable.forEach((leg, i) => {
      const close = maps[i]!.get(t);
      if (close !== undefined) { last[i] = close; base[i] ??= close; }
      const current = last[i], start = base[i];
      if (current === null || start === null || start <= 0) { missing++; value += 100 * (leg.weightBps / total); return; }
      value += (current / start) * 100 * (leg.weightBps / total);
    });
    if (missing > 1) continue;
    points.push({ t, value: round(value) });
  }
  return points;
}

/** Bag chart: every tradable leg fetched in parallel; legs that fail are reported (`ok:false`) and excluded from the index. */
export async function bagChart(bag: Bag, range: ChartRange, now = new Date()): Promise<BagChart> {
  return memo(`bag:${bag.id}:${range}:${process.env.TOKENS_API_KEY ? "k" : "-"}`, bagChartTtl, () => computeBagChart(bag, range, now));
}

async function computeBagChart(bag: Bag, range: ChartRange, now: Date): Promise<BagChart> {
  const { interval } = rangeConfig[range];
  const window = windowFor(range, now);
  const definitions = await bagAssets(bag);
  const resolved = await Promise.all(definitions.map(async (asset) => ({ asset, mint: (await resolveAsset(bag, asset)).mint })));
  const settled = await Promise.allSettled(resolved.map(({ mint }) => mint ? seriesFor(mint, interval, window) : Promise.resolve({ candles: [] as Candle[], reason: "not_tradable" as ChartReason })));
  const series = settled.map((item) => item.status === "fulfilled" ? item.value : { candles: [] as Candle[], reason: "unavailable" as ChartReason });
  const legs: ChartLeg[] = resolved.map(({ asset, mint }, i) => {
    const { candles, reason } = series[i]!;
    const first = candles[0], last = candles[candles.length - 1];
    return { mint, symbol: asset.symbol, weight: asset.weightBps / 10000, weightBps: asset.weightBps, change: reason === null && first && last ? { pct: pct(first.c, last.c) } : null, ok: reason === null, reason };
  });
  const points = bagIndex(series.map((item, i) => ({ weightBps: item.reason === null ? resolved[i]!.asset.weightBps : 0, candles: item.candles })), interval);
  const okLegs = legs.filter((leg) => leg.ok).length;
  const reason: ChartReason | null = !definitions.length ? "not_tradable" : !process.env.TOKENS_API_KEY ? "unconfigured" : okLegs === 0 ? (legs.every((leg) => leg.reason === "not_tradable") ? "not_tradable" : legs.some((leg) => leg.reason === "unavailable") ? "unavailable" : legs.some((leg) => leg.reason === "unresolved") ? "unresolved" : "insufficient_data") : points.length < 2 ? "insufficient_data" : null;
  const usable = reason === null ? points : [];
  const lastT = Math.max(0, ...series.flatMap((item) => item.candles.map((candle) => candle.t)));
  return { bagId: bag.id, range, interval, points: usable, change: usable.length >= 2 ? { pct: pct(usable[0]!.value, usable[usable.length - 1]!.value) } : null, legs, source: CHART_SOURCE, reason, asOf: lastT ? new Date(lastT * 1000).toISOString() : null };
}

/** Mini series for the bag list: last 24h of hourly closes per bag (index base 100), all bags at once, cached 5 minutes. */
export async function sparklines(now = new Date()): Promise<Sparklines> {
  return memo(`sparklines:${process.env.TOKENS_API_KEY ? "k" : "-"}`, sparklineTtl, async () => {
    const to = Math.floor(now.getTime() / 1000), window = { from: to - 86400, to };
    const entries = await Promise.all(bags.map(async (bag) => {
      const definitions = await bagAssets(bag);
      const resolved = await Promise.all(definitions.map(async (asset) => ({ asset, mint: (await resolveAsset(bag, asset)).mint })));
      const settled = await Promise.allSettled(resolved.map(({ mint }) => mint ? seriesFor(mint, "1H", window) : Promise.resolve({ candles: [] as Candle[], reason: "not_tradable" as ChartReason })));
      const legs = settled.map((item, i) => item.status === "fulfilled" && item.value.reason === null ? { weightBps: resolved[i]!.asset.weightBps, candles: item.value.candles } : { weightBps: 0, candles: [] as Candle[] });
      const points = bagIndex(legs, "1H");
      return [bag.id, points.length >= 2 ? points : []] as const;
    }));
    const any = entries.some(([, points]) => points.length);
    return { range: "1D", interval: "1H", source: CHART_SOURCE, reason: !process.env.TOKENS_API_KEY ? "unconfigured" : any ? null : "unavailable", sparklines: Object.fromEntries(entries) };
  });
}
