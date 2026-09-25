import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { setSecrets, resetConfig } from "./config";
import { candlesFor, normaliseCandle, resetTokensApiCache, resolveAsset } from "./tokens-api";

const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const originalFetch = globalThis.fetch;
const from = 1790200000, to = 1790300000;

/** tokens.xyz response shapes as riven-cash's client types them (`TokensResolveResponse`, `TokensPriceChartResponse`). */
export const resolveFixture = { assetId: "nvidia", asset: { assetId: "nvidia", name: "NVIDIA", symbol: "NVDA", category: "stock", aliases: ["NVDAx"] }, variant: { mint: NVDAX, chain: "solana", kind: "xstock", liquidityTier: "high", trustTier: "verified", tags: ["xstocks"], issuer: "Backed" } };
export const chartFixture = { assetId: "nvidia", mint: NVDAX, interval: "1H", from, to, candles: [
  { time: 1790204400, open: 224.1, high: 226.0, low: 223.8, close: 225.2, volume: 12000.5 },
  { time: 1790208000, open: 225.2, high: 225.9, low: 224.0, close: 224.6, volume: 8000 },
  { timestamp: 1790211600000, close: 226.4 }, // ms timestamp, close-only candle
  { t: 1790215200, open: 226.4, high: 227.1, low: 226.0, close: 227.0, volume: 15000 },
  { time: 1790208000, open: 0, close: 999 }, // duplicate timestamp: first kept
  { time: 0, close: 1 }, { close: 5 }, "junk", // dropped
] };

function tokens(options: { resolve?: () => Response; chart?: () => Response } = {}) {
  const calls = { resolve: 0, chart: 0 };
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.tokens.xyz");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("tk-test");
    if (url.pathname === "/v1/assets/resolve") { calls.resolve++; expect(url.searchParams.get("ref")).toBe(NVDAX); return options.resolve ? options.resolve() : Response.json(resolveFixture); }
    calls.chart++;
    expect(url.pathname).toBe("/v1/assets/nvidia/price-chart");
    expect(Object.fromEntries(url.searchParams)).toEqual({ mint: NVDAX, interval: "1H", from: String(from), to: String(to) });
    return options.chart ? options.chart() : Response.json(chartFixture);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => { resetTokensApiCache(); setSecrets({ TokensApiKey: "tk-test" }); });
afterEach(() => { globalThis.fetch = originalFetch; resetConfig(); });

describe("tokens.xyz client", () => {
  it("normalises provider candles across key variants and fills missing OHLC from close", () => {
    expect(normaliseCandle({ time: 1790204400, open: 224.1, high: 226, low: 223.8, close: 225.2, volume: 12000.5 })).toEqual({ t: 1790204400, o: 224.1, h: 226, l: 223.8, c: 225.2, v: 12000.5 });
    expect(normaliseCandle({ timestamp: 1790211600000, value: "226.4" })).toEqual({ t: 1790211600, o: 226.4, h: 226.4, l: 226.4, c: 226.4, v: null });
    expect(normaliseCandle({ t: 1, price: 3, open: 2, high: 1, low: 5 })).toEqual({ t: 1, o: 2, h: 3, l: 2, c: 3, v: null }); // inconsistent extremes clamped
    expect(normaliseCandle({ time: 1, close: 0 })).toBeNull(); expect(normaliseCandle({ close: 1 })).toBeNull(); expect(normaliseCandle(null)).toBeNull();
  });
  it("reports unconfigured without a key and never calls the provider", async () => {
    setSecrets({ TokensApiKey: undefined });
    const calls = tokens();
    expect(await resolveAsset(NVDAX)).toBe("unconfigured");
    expect(await candlesFor(NVDAX, "1H", from, to)).toEqual({ ok: false, reason: "unconfigured" });
    expect(calls).toEqual({ resolve: 0, chart: 0 });
  });
  it("resolves the mint once, fetches candles with mint/interval/from/to, sorts, dedupes and caches for 60s", async () => {
    const calls = tokens();
    const result = await candlesFor(NVDAX, "1H", from, to);
    expect(result.ok && result.assetId).toBe("nvidia");
    expect(result.ok && result.candles.map((candle) => [candle.t, candle.c])).toEqual([[1790204400, 225.2], [1790208000, 224.6], [1790211600, 226.4], [1790215200, 227]]);
    const [again, concurrent] = await Promise.all([candlesFor(NVDAX, "1H", from, to), candlesFor(NVDAX, "1H", from, to)]);
    expect(again).toEqual(result); expect(concurrent).toEqual(result);
    expect(calls).toEqual({ resolve: 1, chart: 1 });
  });
  it("distinguishes unresolved mints from provider failures and serves stale candles on a later failure", async () => {
    tokens({ resolve: () => Response.json({ error: { _tag: "NotFoundError", message: "unknown" } }, { status: 404 }) });
    expect(await candlesFor(NVDAX, "1H", from, to)).toEqual({ ok: false, reason: "unresolved" });
    resetTokensApiCache();
    tokens({ chart: () => new Response("down", { status: 503 }) });
    expect(await candlesFor(NVDAX, "1H", from, to)).toEqual({ ok: false, reason: "unavailable" });
    resetTokensApiCache();
    tokens();
    const good = await candlesFor(NVDAX, "1H", from, to);
    tokens({ chart: () => new Response("down", { status: 503 }) });
    expect(await candlesFor(NVDAX, "1H", from, to + 120)).toEqual(good); // new cache bucket, provider down -> stale candles
  });
});
