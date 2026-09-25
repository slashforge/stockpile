import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { setSecrets, setFeatures, resetConfig } from "./config";
import { assetMarket, bagMarket, configureReferencePrices, liquidityTier, marketSnapshot, premiumPct, pythEquityFeeds, resetMarketCache, scaledUiMultiplier, trackMints, type AssetMarket } from "./market";

const A = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const B = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const originalFetch = globalThis.fetch;

function provider(options: { price?: () => Response; tokens?: () => Response; pyth?: () => Response; quote?: (mint: string) => Response } = {}) {
  const calls = { price: 0, tokens: 0, pyth: 0, quote: 0 };
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/price/v3")) {
      calls.price++;
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test");
      expect(new URL(url).searchParams.get("ids")).toBe(`${A},${B}`);
      return options.price ? options.price() : Response.json({
        [A]: { usdPrice: 335.87, priceChange24h: 0.41, liquidity: 559887, stockData: { id: "xstocks", price: 335.6, updatedAt: "2026-09-25T06:35:11Z" }, scaledUiConfig: { multiplier: 1.0026, newMultiplier: 1.0032, newMultiplierEffectiveAt: "2026-08-08T00:30:00Z" } },
        [B]: { usdPrice: 1335.5, priceChange24h: 1.0, liquidity: 888617, stockData: { id: "prestocks", price: 1023.7, updatedAt: "2026-09-25T06:35:14Z" } },
      });
    }
    if (url.includes("/tokens/v2/search")) { calls.tokens++; return options.tokens ? options.tokens() : Response.json([{ id: A, liquidity: 559425, organicScore: 74.2, organicScoreLabel: "medium", holderCount: 34777, stats24h: { buyVolume: 848479.8, sellVolume: 825030.4 } }, { id: B, liquidity: 888618, organicScore: 77, organicScoreLabel: "medium", holderCount: 31921, stats24h: { buyVolume: 799064, sellVolume: 840579 } }]); }
    if (url.includes("hermes.pyth.network")) { calls.pyth++; expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer pyth-test"); return options.pyth ? options.pyth() : Response.json({ parsed: [{ id: pythEquityFeeds.AAPL, price: { price: "33560000000", expo: -8, publish_time: 1790366400 } }] }); }
    if (url.includes("/swap/v1/quote")) {
      calls.quote++;
      const params = new URL(url).searchParams;
      expect(params.get("inputMint")).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); expect(params.get("amount")).toBe("10000000");
      return options.quote ? options.quote(params.get("outputMint")!) : Response.json({ outputMint: params.get("outputMint"), outAmount: "1", priceImpactPct: params.get("outputMint") === A ? "0.0005" : "0.0214563" });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => { resetMarketCache(); trackMints([A, B]); setSecrets({ JupiterApiKey: "test", PythApiKey: undefined }); setFeatures({ market: true }); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConfig();
});

describe("market snapshot", () => {
  it("fetches all tracked mints in one batched refresh and serves the cache afterwards", async () => {
    const calls = provider();
    const [first, second] = await Promise.all([marketSnapshot(), marketSnapshot()]);
    expect(first).toBe(second!);
    expect(first?.mints.get(A)).toMatchObject({ price: 335.87, change: 0.41, multiplier: 1.0032, liquidity: 559425, organicScore: 74.2, organicScoreLabel: "medium", holderCount: 34777, volume24h: 848479.8 + 825030.4, stock: { id: "xstocks", price: 335.6 } });
    expect(await marketSnapshot()).toBe(first!);
    expect(calls).toEqual({ price: 1, tokens: 1, pyth: 0, quote: 2 });
    expect(first?.probes.get(B)).toMatchObject({ sizeUsdc: 10, priceImpactPct: expect.closeTo(2.14563, 6) });
    expect(await scaledUiMultiplier(A)).toBe(1.0032);
    expect(await scaledUiMultiplier("So11111111111111111111111111111111111111112")).toBe(1);
  });
  it("returns null without a key or when disabled, and null (not throw) when the first refresh fails", async () => {
    setSecrets({ JupiterApiKey: undefined });
    expect(await marketSnapshot()).toBeNull();
    setSecrets({ JupiterApiKey: "test" }); setFeatures({ market: false });
    expect(await marketSnapshot()).toBeNull();
    setFeatures({ market: true });
    resetMarketCache(); trackMints([A, B]);
    provider({ price: () => new Response("down", { status: 503 }) });
    expect(await marketSnapshot()).toBeNull();
    resetMarketCache(); trackMints([A, B]);
    globalThis.fetch = mock(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    expect(await marketSnapshot()).toBeNull();
  });
  it("keeps prices when only the token metadata call fails", async () => {
    provider({ tokens: () => new Response("down", { status: 503 }) });
    const current = await marketSnapshot();
    expect(current?.mints.get(A)).toMatchObject({ price: 335.87, liquidity: 559887, organicScore: null, holderCount: null, volume24h: null });
  });
  it("uses Pyth for the underlying only when configured and falls back to Jupiter's stock reference", async () => {
    provider();
    let market = await assetMarket(A, { underlyingTicker: "AAPL" });
    expect(market?.underlying).toEqual({ source: "jupiter-stock", price: 335.6, asOf: "2026-09-25T06:35:11Z" });
    expect(market?.premiumPct).toBeCloseTo((335.87 / 335.6 - 1) * 100, 6);
    resetMarketCache(); trackMints([A, B]); setSecrets({ PythApiKey: "pyth-test" });
    const calls = provider();
    market = await assetMarket(A, { underlyingTicker: "AAPL" });
    expect(calls.pyth).toBe(1);
    expect(market?.underlying).toEqual({ source: "pyth", price: 335.6, asOf: new Date(1790366400 * 1000).toISOString() });
    expect(await assetMarket(B, { mark: { price: 1023.7, asOf: "2026-09-25T06:00:00Z" } })).toMatchObject({ usdPrice: 1335.5, underlying: { source: "prestocks", price: 1023.7 }, premiumPct: expect.closeTo((1335.5 / 1023.7 - 1) * 100, 6) });
    expect(await assetMarket(null)).toBeNull();
    expect(await assetMarket("So11111111111111111111111111111111111111112")).toBeNull();
    resetMarketCache(); trackMints([A, B]);
    provider({ pyth: () => new Response("unauthorized", { status: 401 }) });
    expect((await assetMarket(A, { underlyingTicker: "AAPL" }))?.underlying?.source).toBe("jupiter-stock");
  });
  it("uses the fixed 24h snapshot reference when the loader has one, else Jupiter's rolling window, and keeps stale probes on failure", async () => {
    provider({ quote: (mint) => mint === A ? Response.json({ outputMint: A, priceImpactPct: "0.001" }) : new Response("rate limited", { status: 429 }) });
    configureReferencePrices(async (mints) => new Map(mints.filter((mint) => mint === A).map((mint) => [mint, 320])));
    const a = await assetMarket(A), b = await assetMarket(B);
    expect(a).toMatchObject({ priceChange24hPct: expect.closeTo((335.87 / 320 - 1) * 100, 9), change24hSource: "snapshot", probe: { sizeUsdc: 10, priceImpactPct: expect.closeTo(0.1, 9) } });
    expect(b).toMatchObject({ priceChange24hPct: 1.0, change24hSource: "jupiter", probe: null });
    configureReferencePrices(async () => { throw new Error("db down"); });
    resetMarketCache(); trackMints([A, B]); provider();
    expect((await assetMarket(A))?.change24hSource).toBe("jupiter");
  });
});

describe("derived metrics", () => {
  it("computes premium, tiers and weight-averaged bag metrics with coverage", () => {
    expect(premiumPct(110, 100)).toBeCloseTo(10, 9);
    expect(premiumPct(null, 100)).toBeNull(); expect(premiumPct(100, null)).toBeNull(); expect(premiumPct(100, 0)).toBeNull();
    expect([liquidityTier(1_000_000), liquidityTier(100_000), liquidityTier(99_999.99), liquidityTier(null)]).toEqual(["deep", "ok", "thin", null]);
    // Probe impact can only make a tier worse: a $1M pool with 2% impact at $10 is thin; a $100k pool with 0.05% impact stays ok.
    expect([liquidityTier(1_000_000, 2.1), liquidityTier(100_000, 0.05), liquidityTier(1_000_000, 0.5), liquidityTier(null, 0.2)]).toEqual(["thin", "ok", "ok", "deep"]);
    const market = (usdPrice: number | null, priceChange24hPct: number | null, liquidityUsd: number | null, premium: number | null, probeImpact: number | null = null): AssetMarket => ({ usdPrice, priceChange24hPct, change24hSource: priceChange24hPct === null ? null : "jupiter", liquidityUsd, organicScore: null, organicScoreLabel: null, holderCount: null, volume24hUsd: null, underlying: null, premiumPct: premium, probe: probeImpact === null ? null : { sizeUsdc: 10, priceImpactPct: probeImpact, asOf: "2026-09-25T00:00:00Z" }, asOf: "2026-09-25T00:00:00Z" });
    const bag = bagMarket([
      { symbol: "A", weightBps: 5000, market: market(1, 2, 2_000_000, 1, 2.1) },
      { symbol: "B", weightBps: 3000, market: market(1, -1, 50_000, null, 0.4) },
      { symbol: "C", weightBps: 2000, market: null },
    ]);
    expect(bag).toEqual({ change24hPct: (2 * 5000 - 1 * 3000) / 8000, change24hSource: "jupiter", premiumPct: 1, coverage: 0.8, worstLiquidityUsd: 50_000, worstLiquiditySymbol: "B", worstImpactPct: 2.1, worstImpactSymbol: "A", asOf: "2026-09-25T00:00:00Z" });
    expect(bagMarket([{ symbol: "A", weightBps: 10000, market: { ...market(1, 2, null, null), change24hSource: "snapshot" } }])).toMatchObject({ change24hSource: "snapshot", worstImpactPct: null, worstImpactSymbol: null });
    expect(bagMarket([{ symbol: "A", weightBps: 10000, market: null }])).toBeNull();
    expect(bagMarket([])).toBeNull();
  });
});
