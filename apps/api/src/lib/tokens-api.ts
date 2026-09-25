// tokens.xyz client (https://api.tokens.xyz/v1, `x-api-key` header), mirroring riven-cash's `lib/tokens-api.ts`:
// `/assets/resolve?ref=<mint>` gives the canonical assetId (+ variant mint), `/assets/{assetId}/price-chart?mint&interval&from&to`
// gives candles. Candle keys vary (`time|timestamp|t`, `close|value|price`), so they are normalised here to {t,o,h,l,c,v}.
// Without the TokensApiKey secret every call reports "unconfigured" so callers fall back to the snapshot table.
import { secret } from "./config";
import { base58Mint } from "./constants";

export const TOKENS_API_BASE_URL = "https://api.tokens.xyz/v1";
export const tokensIntervals = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"] as const;
export type TokensInterval = (typeof tokensIntervals)[number];
export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number | null };
export type Resolved = { assetId: string; mint: string };
export type TokensFailure = "unconfigured" | "unresolved" | "unavailable";
export type CandlesResult = { ok: true; candles: Candle[]; assetId: string } | { ok: false; reason: TokensFailure };

const resolveTtl = 24 * 60 * 60 * 1000;
const resolveFailureTtl = 10 * 60 * 1000;
const candleTtl = 60 * 1000;
const maxCandles = 5000;
const resolveCache = new Map<string, { expiresAt: number; value: Resolved | null }>();
const candleCache = new Map<string, { expiresAt: number; value: CandlesResult; pending?: Promise<CandlesResult> }>();

const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;

/** Normalises one provider candle; null when it has no usable timestamp or close. Seconds and milliseconds are both accepted. */
export function normaliseCandle(raw: unknown): Candle | null {
  if (!raw || typeof raw !== "object") return null;
  const candle = raw as Record<string, unknown>;
  let t = num(candle.time ?? candle.timestamp ?? candle.t);
  const c = num(candle.close ?? candle.value ?? candle.price);
  if (t === null || t <= 0 || c === null || c <= 0) return null;
  if (t > 1e11) t = Math.floor(t / 1000);
  const o = num(candle.open) ?? c, h = num(candle.high) ?? Math.max(o, c), l = num(candle.low) ?? Math.min(o, c);
  const v = num(candle.volume);
  return { t: Math.floor(t), o: o > 0 ? o : c, h: Math.max(h, o, c), l: Math.max(Math.min(l, o, c), 0), c, v: v !== null && v >= 0 ? v : null };
}

async function getJson(path: string, params: Record<string, string | number | undefined>, key: string): Promise<unknown> {
  const url = new URL(`${TOKENS_API_BASE_URL}${path}`);
  for (const [name, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(name, String(value));
  const response = await fetch(url, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw Object.assign(new Error(`tokens.xyz ${response.status}`), { status: response.status }); }
  return response.json();
}

/** Canonical tokens.xyz asset for a mint (cached 24h; unresolved 10 min). */
export async function resolveAsset(mint: string): Promise<Resolved | null | "unconfigured"> {
  const key = secret("TokensApiKey");
  if (!key) return "unconfigured";
  if (!base58Mint.test(mint)) return null;
  const cached = resolveCache.get(mint);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const body = await getJson("/assets/resolve", { ref: mint }, key) as { assetId?: unknown; variant?: { mint?: unknown } | null };
    const value = typeof body?.assetId === "string" && body.assetId ? { assetId: body.assetId, mint: typeof body.variant?.mint === "string" && base58Mint.test(body.variant.mint) ? body.variant.mint : mint } : null;
    resolveCache.set(mint, { expiresAt: Date.now() + (value ? resolveTtl : resolveFailureTtl), value });
    return value;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) { resolveCache.set(mint, { expiresAt: Date.now() + resolveFailureTtl, value: null }); return null; }
    return cached?.value ?? null;
  }
}

async function fetchCandles(mint: string, interval: TokensInterval, from: number | undefined, to: number | undefined, key: string): Promise<CandlesResult> {
  const resolved = await resolveAsset(mint);
  if (resolved === "unconfigured") return { ok: false, reason: "unconfigured" };
  if (!resolved) return { ok: false, reason: "unresolved" };
  const body = await getJson(`/assets/${encodeURIComponent(resolved.assetId)}/price-chart`, { mint: resolved.mint, interval, from, to }, key) as { candles?: unknown };
  if (!Array.isArray(body?.candles)) throw new Error("tokens.xyz candles malformed");
  const low = from === undefined ? 0 : from - 86400, high = (to ?? Math.floor(Date.now() / 1000)) + 86400;
  const candles = body.candles.map(normaliseCandle).filter((candle): candle is Candle => candle !== null && candle.t >= low && candle.t <= high)
    .sort((a, b) => a.t - b.t).filter((candle, index, list) => index === 0 || candle.t !== list[index - 1]!.t).slice(-maxCandles);
  return { ok: true, candles, assetId: resolved.assetId };
}

/**
 * Candles for a mint over [from, to] (unix seconds; both optional -- omitting them asks tokens.xyz for its full history, as riven-cash's
 * "ALL" period does). Cached 60s per (mint, interval, window bucket); stale candles are served on failure; concurrent calls share one fetch.
 */
export async function candlesFor(mint: string, interval: TokensInterval, from?: number, to?: number): Promise<CandlesResult> {
  const key = secret("TokensApiKey");
  if (!key) return { ok: false, reason: "unconfigured" };
  const bucket = Math.floor((to ?? Date.now() / 1000) / 60);
  const cacheKey = `${mint}:${interval}:${from ?? "all"}:${bucket}`;
  let entry = candleCache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (!entry?.pending) {
    if (candleCache.size >= 500) candleCache.delete(candleCache.keys().next().value!);
    const stale = [...candleCache.values()].find((item) => item.value.ok && cacheKey.startsWith(`${mint}:${interval}:`))?.value;
    const pending = fetchCandles(mint, interval, from, to, key).catch((): CandlesResult => stale ?? { ok: false, reason: "unavailable" });
    entry = { expiresAt: 0, value: stale ?? { ok: false, reason: "unavailable" }, pending };
    candleCache.set(cacheKey, entry);
    pending.then((value) => { candleCache.set(cacheKey, { expiresAt: Date.now() + (value.ok ? candleTtl : 20_000), value }); });
  }
  return entry.pending!;
}

export function resetTokensApiCache() { resolveCache.clear(); candleCache.clear(); }
