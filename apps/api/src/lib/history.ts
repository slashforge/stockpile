// Price history. Preferred source: tokens.xyz candles per asset (interval by range: 24h->15m, 7d->1H, 30d->4H, 1y->1D), with a
// weighted bag index over the timestamps where every asset has a candle (base 100 at the first common timestamp, using close).
// Fallback when tokens.xyz is unconfigured, cannot resolve every mint, or fails: the hourly price_snapshots table, presented in the
// same candle shape (o=h=l=c=snapshot price, v=null) and labelled `source:"snapshot"` so the client can say so.
import { secret } from "./config";
import { and, asc, gte, inArray, lte } from "drizzle-orm";
import { db } from "@stockpile/core/db";
import { priceSnapshots } from "@stockpile/core/db/schema";
import { bagAssets, resolveAsset, trackAllMints, type Bag } from "./bags";
import { marketSnapshot } from "./market";
import { candlesFor, type Candle, type TokensInterval } from "./tokens-api";

export type Range = "24h" | "7d" | "30d" | "1y";
export type HistorySource = "tokens" | "snapshot";
export type AssetSeries = { symbol: string; mint: string | null; weightBps: number; candles: Candle[] };
export type BagHistory = { bagId: string; source: HistorySource; range: Range; interval: TokensInterval; from: number; to: number; assets: AssetSeries[]; bag: { t: number; value: number }[]; changePct: number | null; asOf: string | null };
export type AssetChart = { mint: string; symbol: string | null; source: HistorySource; range: Range; interval: TokensInterval; from: number; to: number; candles: Candle[]; changePct: number | null; asOf: string | null };

export const rangeSeconds: Record<Range, number> = { "24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "1y": 365 * 86400 };
export const rangeInterval: Record<Range, TokensInterval> = { "24h": "15m", "7d": "1H", "30d": "4H", "1y": "1D" };
const snapshotStepSeconds: Record<Range, number> = { "24h": 3600, "7d": 3600, "30d": 4 * 3600, "1y": 24 * 3600 };

/** `bun run prices:snapshot` (also hourly in-process): one usdPrice row per tracked mint, keyed to the start of the current hour so reruns are idempotent. */
export async function snapshotPrices(now = new Date()) {
  trackAllMints();
  const current = await marketSnapshot();
  if (!current) return { written: 0, skipped: "market data unavailable" };
  const ts = new Date(Math.floor(now.getTime() / 36e5) * 36e5);
  const rows = [...current.mints].filter(([, data]) => data.price !== null && data.price > 0).map(([mint, data]) => ({ mint, usdPrice: data.price!.toFixed(8), ts }));
  if (!rows.length) return { written: 0, skipped: "no prices" };
  await db.insert(priceSnapshots).values(rows).onConflictDoNothing();
  return { written: rows.length, skipped: null };
}

/** Snapshot price per mint closest to 24h ago (within +/-90 min); mints without one are absent so callers fall back to Jupiter's window. */
export async function referencePrices24h(mints: string[], now = new Date()): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!mints.length) return result;
  const target = now.getTime() - 864e5, window = 90 * 60 * 1000;
  const rows = await db.select().from(priceSnapshots).where(and(inArray(priceSnapshots.mint, mints), gte(priceSnapshots.ts, new Date(target - window)), lte(priceSnapshots.ts, new Date(target + window))));
  const best = new Map<string, number>();
  for (const row of rows) {
    const distance = Math.abs(row.ts.getTime() - target), price = Number(row.usdPrice);
    if (price > 0 && (!best.has(row.mint) || distance < best.get(row.mint)!)) { best.set(row.mint, distance); result.set(row.mint, price); }
  }
  return result;
}

/** Snapshot rows as flat candles, thinned to the range's native step (keeps the first row of each step bucket). */
async function snapshotCandles(mints: string[], range: Range, from: number, to: number): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();
  if (!mints.length) return result;
  const rows = await db.select().from(priceSnapshots).where(and(inArray(priceSnapshots.mint, mints), gte(priceSnapshots.ts, new Date(from * 1000)), lte(priceSnapshots.ts, new Date(to * 1000)))).orderBy(asc(priceSnapshots.ts));
  const step = snapshotStepSeconds[range];
  for (const row of rows) {
    const price = Number(row.usdPrice);
    if (!(price > 0)) continue;
    const t = Math.floor(row.ts.getTime() / 1000);
    const list = result.get(row.mint) ?? [];
    if (list.length && Math.floor(list[list.length - 1]!.t / step) === Math.floor(t / step)) continue;
    list.push({ t, o: price, h: price, l: price, c: price, v: null });
    result.set(row.mint, list);
  }
  return result;
}

export const changePct = (candles: Candle[]): number | null => candles.length >= 2 && candles[0]!.c > 0 ? (candles[candles.length - 1]!.c / candles[0]!.c - 1) * 100 : null;

/** Weighted index over timestamps where every asset has a candle; base 100 at the first common timestamp; uses close. */
export function bagIndex(assets: AssetSeries[]): { t: number; value: number }[] {
  if (!assets.length || assets.some((asset) => !asset.candles.length)) return [];
  const maps = assets.map((asset) => new Map(asset.candles.map((candle) => [candle.t, candle.c])));
  const common = [...maps[0]!.keys()].filter((t) => maps.every((map) => map.has(t))).sort((a, b) => a - b);
  if (!common.length) return [];
  const total = assets.reduce((sum, asset) => sum + asset.weightBps, 0) || 1;
  const base = maps.map((map) => map.get(common[0]!)!);
  return common.map((t) => {
    let value = 0;
    assets.forEach((asset, i) => { const start = base[i]!; value += (start > 0 ? maps[i]!.get(t)! / start : 1) * (asset.weightBps / total) * 100; });
    return { t, value: Math.round(value * 1000) / 1000 };
  });
}

type Window = { from: number; to: number; interval: TokensInterval };
const windowFor = (range: Range, now: Date): Window => { const to = Math.floor(now.getTime() / 1000); return { from: to - rangeSeconds[range], to, interval: rangeInterval[range] }; };

/** Candles per mint from tokens.xyz, or null when any mint is unconfigured/unresolved/unavailable (then the caller falls back as a whole). */
async function tokensCandles(mints: string[], window: Window): Promise<Map<string, Candle[]> | null> {
  if (!mints.length || !secret("TokensApiKey")) return null;
  const results = await Promise.all(mints.map((mint) => candlesFor(mint, window.interval, window.from, window.to)));
  const map = new Map<string, Candle[]>();
  for (const [i, result] of results.entries()) { if (!result.ok || !result.candles.length) return null; map.set(mints[i]!, result.candles); }
  return map;
}

export async function bagHistory(bag: Bag, range: Range, now = new Date()): Promise<BagHistory> {
  const window = windowFor(range, now);
  const definitions = await bagAssets(bag);
  const resolved = await Promise.all(definitions.map(async (asset) => ({ asset, mint: (await resolveAsset(bag, asset)).mint })));
  const mints = resolved.map((item) => item.mint).filter((mint): mint is string => mint !== null);
  const allResolved = mints.length > 0 && mints.length === resolved.length;
  const tokens = allResolved ? await tokensCandles(mints, window) : null;
  const byMint = tokens ?? await snapshotCandles(mints, range, window.from, window.to);
  const assets: AssetSeries[] = resolved.map(({ asset, mint }) => ({ symbol: asset.symbol, mint, weightBps: asset.weightBps, candles: mint ? byMint.get(mint) ?? [] : [] }));
  const index = bagIndex(assets);
  const last = Math.max(0, ...assets.flatMap((asset) => asset.candles.map((candle) => candle.t)));
  return { bagId: bag.id, source: tokens ? "tokens" : "snapshot", range, interval: window.interval, from: window.from, to: window.to, assets, bag: index,
    changePct: index.length >= 2 ? Math.round((index[index.length - 1]!.value / index[0]!.value - 1) * 100 * 1000) / 1000 : null, asOf: last ? new Date(last * 1000).toISOString() : null };
}

export async function assetChart(mint: string, symbol: string | null, range: Range, now = new Date()): Promise<AssetChart> {
  const window = windowFor(range, now);
  const tokens = await tokensCandles([mint], window);
  const candles = tokens?.get(mint) ?? (await snapshotCandles([mint], range, window.from, window.to)).get(mint) ?? [];
  const last = candles[candles.length - 1]?.t;
  return { mint, symbol, source: tokens ? "tokens" : "snapshot", range, interval: window.interval, from: window.from, to: window.to, candles, changePct: changePct(candles), asOf: last ? new Date(last * 1000).toISOString() : null };
}
