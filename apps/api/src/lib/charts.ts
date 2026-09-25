// Chart series for the mobile app, built from tokens.xyz candles (the same source riven-cash charts use). Ranges follow riven's
// period mapping: 1D -> 15m candles over 24h, 1W -> 1H over 7d, 1M -> 4H over 30d, 1Y -> 1D over 365d, ALL -> 1D candles. Riven sends ALL without a window,
// but tokens.xyz then returns only the last few days (verified live), so ALL asks for two years explicitly. Every endpoint
// fails soft: without TOKENS_API_KEY (or when the provider is down / a mint is unknown) the response is 200 with empty points and a
// typed `reason`, never a 500, so the client can simply hide the chart. `/bags/{id}/history` (snapshot fallback) stays as-is.
// Long horizons (1Y, ALL) start the bag index at the first day every charted leg has a close, so a newly listed token shortens the
// window rather than being counted flat; short horizons tolerate one late leg as before.
// Single definition of a bag's period change: `bagChart(bag, range).change.pct` (that range's interval, window and leg-tolerance rule,
// first -> last index point). `/bags/returns` reuses bagChart for 1M / 1Y / ALL, so a card figure always equals the detail-screen figure.
// Daily-interval ranges (1Y, ALL) share one two-year daily fetch per mint and are clipped locally, so returns cost two upstream calls
// per mint (4H/30d and 1D/2y), not three.
import { bagAssets, bags, resolveAsset, type Bag } from "./bags";
import { candlesFor, type Candle, type TokensFailure, type TokensInterval } from "./tokens-api";

export const chartRanges = ["1D", "1W", "1M", "1Y", "ALL"] as const;
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
export type BagReturns = { "1M": number | null; "1Y": number | null; ALL: number | null; since: string | null; sparkline1M: IndexPoint[] };
export type BagReturnsResponse = { source: typeof CHART_SOURCE; interval: "1D"; asOf: string | null; reason: ChartReason | null; returns: Record<string, BagReturns> };

export const rangeConfig: Record<ChartRange, { interval: TokensInterval; seconds: number; requireAllLegs?: boolean }> = { "1D": { interval: "15m", seconds: 86400 }, "1W": { interval: "1H", seconds: 7 * 86400 }, "1M": { interval: "4H", seconds: 30 * 86400 }, "1Y": { interval: "1D", seconds: 365 * 86400, requireAllLegs: true }, ALL: { interval: "1D", seconds: 2 * 365 * 86400, requireAllLegs: true } };
export const intervalSeconds: Record<TokensInterval, number> = { "1m": 60, "5m": 300, "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 7 * 86400 };
const bagChartTtl = 60_000, sparklineTtl = 5 * 60_000, returnsTtl = 5 * 60_000;
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

/** Candles for one mint over the window. Daily requests always fetch the two-year ALL window (cached per mint) and clip to [from, to]. */
async function seriesFor(mint: string, interval: TokensInterval, window: Window): Promise<{ candles: Candle[]; reason: ChartReason | null }> {
  const result = interval === "1D"
    ? await candlesFor(mint, interval, window.to - rangeConfig.ALL.seconds, window.to).then((value) => value.ok ? { ...value, candles: value.candles.filter((candle) => candle.t >= window.from && candle.t <= window.to) } : value)
    : await candlesFor(mint, interval, window.from, window.to);
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
 * more than one leg are dropped (every missing leg drops the bucket with `requireAllLegs`, so the index starts once all legs have data).
 * The index is the weighted sum (weights renormalised over the legs given); base 100 at the first bucket.
 */
export function bagIndex(legs: LegSeries[], interval: TokensInterval, options: { requireAllLegs?: boolean } = {}): IndexPoint[] {
  const usable = legs.filter((leg) => leg.candles.length && leg.weightBps > 0);
  if (!usable.length) return [];
  const step = intervalSeconds[interval];
  const total = usable.reduce((sum, leg) => sum + leg.weightBps, 0);
  const maps = usable.map((leg) => { const map = new Map<number, number>(); for (const candle of leg.candles) map.set(Math.floor(candle.t / step) * step, candle.c); return map; });
  const buckets = [...new Set(maps.flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);
  const last: (number | null)[] = usable.map(() => null), base: (number | null)[] = usable.map(() => null);
  const points: IndexPoint[] = [];
  const tolerated = options.requireAllLegs ? 0 : 1;
  for (const t of buckets) {
    let missing = 0, value = 0;
    usable.forEach((_, i) => { const close = maps[i]!.get(t); if (close !== undefined) last[i] = close; if (last[i] === null) missing++; });
    if (missing > tolerated) continue; // a leg's base is set at the first emitted bucket, so dropped leading buckets never anchor it
    usable.forEach((leg, i) => {
      const current = last[i];
      if (current !== null) base[i] ??= current;
      const start = base[i];
      value += (current === null || start === null || start <= 0 ? 100 : (current / start) * 100) * (leg.weightBps / total);
    });
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
  const points = bagIndex(series.map((item, i) => ({ weightBps: item.reason === null ? resolved[i]!.asset.weightBps : 0, candles: item.candles })), interval, { requireAllLegs: rangeConfig[range].requireAllLegs });
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

/** One index point per day (the first bucket of each day, plus the final point) for a compact card sparkline. */
function daily(points: IndexPoint[]): IndexPoint[] {
  const out: IndexPoint[] = [];
  let day = -1;
  for (const point of points) { const d = Math.floor(point.t / 86400); if (d !== day) { out.push(point); day = d; } }
  const last = points[points.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Card returns for every bag in one call: exactly `bagChart(bag, "1M" | "1Y" | "ALL").change.pct` (same candles, interval, window and
 * leg rule as the detail screen), `since` = first point of the ALL index, `sparkline1M` = the 1M index thinned to one point per day.
 * Bags are processed one at a time so the fan-out stays bounded; bagChart's 60s memo and the per-mint candle cache dedupe the rest.
 * Cached 5 minutes. A range whose chart has a reason (unconfigured, research-only, provider down) is null, like the chart's change.
 */
export async function bagReturns(now = new Date()): Promise<BagReturnsResponse> {
  return memo(`returns:${process.env.TOKENS_API_KEY ? "k" : "-"}`, returnsTtl, async () => {
    const entries: (readonly [string, BagReturns])[] = [];
    let asOf: string | null = null;
    for (const bag of bags) {
      const [month, year, all] = await Promise.all([bagChart(bag, "1M", now), bagChart(bag, "1Y", now), bagChart(bag, "ALL", now)]);
      const first = all.points[0];
      entries.push([bag.id, { "1M": month.change?.pct ?? null, "1Y": year.change?.pct ?? null, ALL: all.change?.pct ?? null, since: first ? new Date(first.t * 1000).toISOString() : null, sparkline1M: daily(month.points) }]);
      for (const chart of [month, year, all]) if (chart.asOf && (!asOf || chart.asOf > asOf)) asOf = chart.asOf;
    }
    const any = entries.some(([, value]) => value["1M"] !== null || value["1Y"] !== null || value.ALL !== null);
    return { source: CHART_SOURCE, interval: "1D", asOf, reason: !process.env.TOKENS_API_KEY ? "unconfigured" : any ? null : "unavailable", returns: Object.fromEntries(entries) };
  });
}
