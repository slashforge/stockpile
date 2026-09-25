import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { assetChart, bagChart, bagIndex, rangeConfig, resetChartCache, sparklines } from "./charts";
import { bags } from "./bags";
import { resetTokensApiCache, type Candle } from "./tokens-api";

const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", MSFTX = "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const now = new Date("2026-09-25T12:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);
const originalFetch = globalThis.fetch;
const original = { tokens: process.env.TOKENS_API_KEY, mints: process.env.STOCKPILE_ALLOWED_MINTS, market: process.env.STOCKPILE_MARKET, prestocks: process.env.STOCKPILE_PRESTOCKS };
const megacap = bags.find((bag) => bag.id === "megacap-builders")!;
const candle = (t: number, c: number): Candle => ({ t, o: c, h: c, l: c, c, v: null });
const steps = { "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400 } as Record<string, number>;

/** tokens.xyz mock: every mint resolves to `<mint>-asset`; candles come from `prices[mint](i)` at the requested interval over [from, to]. */
function tokens(prices: Record<string, (i: number) => number>, options: { fail?: string[]; unresolved?: string[]; empty?: string[] } = {}) {
  const requests: { path: string; params: Record<string, string> }[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("tk-test");
    requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    if (url.pathname === "/v1/assets/resolve") { const ref = url.searchParams.get("ref")!; return options.unresolved?.includes(ref) ? new Response("nope", { status: 404 }) : Response.json({ assetId: `${ref}-asset`, variant: { mint: ref } }); }
    const mint = url.searchParams.get("mint")!;
    if (options.fail?.includes(mint)) return new Response("down", { status: 503 });
    if (options.empty?.includes(mint)) return Response.json({ candles: [] });
    const step = steps[url.searchParams.get("interval")!]!;
    const to = Number(url.searchParams.get("to")), from = Number(url.searchParams.get("from"));
    const candles = []; let i = 0;
    for (let t = Math.ceil(from / step) * step; t <= to; t += step, i++) { const c = prices[mint]!(i); candles.push({ time: t, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 100 }); }
    return Response.json({ candles });
  }) as unknown as typeof fetch;
  return requests;
}

beforeEach(() => {
  resetTokensApiCache(); resetChartCache();
  process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX},MSFTx:${MSFTX},NVDAx:${NVDAX}`; process.env.STOCKPILE_MARKET = "0"; process.env.STOCKPILE_PRESTOCKS = "0"; process.env.TOKENS_API_KEY = "tk-test";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [["TOKENS_API_KEY", original.tokens], ["STOCKPILE_ALLOWED_MINTS", original.mints], ["STOCKPILE_MARKET", original.market], ["STOCKPILE_PRESTOCKS", original.prestocks]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

describe("asset chart", () => {
  it("maps ranges like riven-cash (1D->15m/24h, 1W->1H/7d, 1M->4H/30d, ALL->1D over two years) and returns sorted closes with abs/pct change", async () => {
    expect(rangeConfig).toEqual({ "1D": { interval: "15m", seconds: 86400 }, "1W": { interval: "1H", seconds: 7 * 86400 }, "1M": { interval: "4H", seconds: 30 * 86400 }, ALL: { interval: "1D", seconds: 730 * 86400 } });
    const requests = tokens({ [NVDAX]: (i) => 10 + i });
    const chart = await assetChart(NVDAX, "NVDAx", "1D", now);
    expect(chart).toMatchObject({ mint: NVDAX, symbol: "NVDAx", range: "1D", interval: "15m", source: "tokens.xyz", reason: null });
    expect(chart.points).toHaveLength(97); expect(chart.candles).toHaveLength(97);
    expect(chart.points[0]).toEqual({ t: Math.ceil((nowSec - 86400) / 900) * 900, close: 10 }); expect(chart.points[96]!.close).toBe(106);
    expect(chart.points.every((point, i, list) => point.t > 0 && point.close > 0 && (i === 0 || point.t > list[i - 1]!.t))).toBe(true);
    expect(chart.change).toEqual({ abs: 96, pct: 960 });
    expect(chart.asOf).toBe(new Date(chart.points[96]!.t * 1000).toISOString());
    expect(requests.find((request) => request.path.endsWith("/price-chart"))!.params).toEqual({ mint: NVDAX, interval: "15m", from: String(nowSec - 86400), to: String(nowSec) });
    const all = await assetChart(NVDAX, "NVDAx", "ALL", now);
    expect(all.interval).toBe("1D"); expect(all.points).toHaveLength(730);
    expect(requests[requests.length - 1]!.params).toEqual({ mint: NVDAX, interval: "1D", from: String(nowSec - 730 * 86400), to: String(nowSec) });
  });
  it("fails soft: unconfigured key, unresolved mint, provider outage and single-point series all give 200-shaped empty charts with a reason", async () => {
    delete process.env.TOKENS_API_KEY;
    expect(await assetChart(NVDAX, "NVDAx", "1W", now)).toMatchObject({ points: [], candles: [], change: null, reason: "unconfigured", asOf: null });
    process.env.TOKENS_API_KEY = "tk-test";
    tokens({}, { unresolved: [NVDAX] });
    expect((await assetChart(NVDAX, "NVDAx", "1W", now)).reason).toBe("unresolved");
    resetTokensApiCache(); tokens({}, { fail: [NVDAX] });
    expect((await assetChart(NVDAX, "NVDAx", "1W", now)).reason).toBe("unavailable");
    resetTokensApiCache(); tokens({}, { empty: [NVDAX] });
    expect(await assetChart(NVDAX, "NVDAx", "1W", now)).toMatchObject({ points: [], change: null, reason: "insufficient_data" });
  });
});

describe("bag index", () => {
  it("normalises each leg to 100 at its first close, weights by bag weight and forward-fills gaps", () => {
    const points = bagIndex([
      { weightBps: 5000, candles: [candle(3600, 10), candle(7200, 11), candle(14400, 12)] }, // gap at 10800 -> forward-filled 11
      { weightBps: 5000, candles: [candle(3600, 100), candle(7200, 90), candle(10800, 80), candle(14400, 80)] },
    ], "1H");
    expect(points).toEqual([{ t: 3600, value: 100 }, { t: 7200, value: 100 }, { t: 10800, value: 95 }, { t: 14400, value: 100 }]);
  });
  it("treats a leg as flat 100 before its first close, drops buckets missing more than one leg and buckets closes to the interval", () => {
    const points = bagIndex([
      { weightBps: 2500, candles: [candle(7200, 2), candle(10800, 3)] },
      { weightBps: 2500, candles: [candle(3600, 1), candle(7200, 1), candle(10800, 1)] },
      { weightBps: 5000, candles: [candle(3700, 50), candle(7250, 50), candle(10900, 55)] }, // off-grid timestamps land in the hour bucket
    ], "1H");
    expect(points).toEqual([{ t: 3600, value: 100 }, { t: 7200, value: 100 }, { t: 10800, value: 25 * 1.5 + 25 + 50 * 1.1 }]);
    expect(bagIndex([{ weightBps: 5000, candles: [candle(3600, 1)] }, { weightBps: 2500, candles: [candle(7200, 1)] }, { weightBps: 2500, candles: [candle(7200, 1)] }], "1H")).toEqual([{ t: 7200, value: 100 }]);
    expect(bagIndex([], "1H")).toEqual([]); expect(bagIndex([{ weightBps: 0, candles: [candle(1, 1)] }], "1H")).toEqual([]);
  });
});

describe("bag chart", () => {
  it("fetches every tradable leg in parallel and returns the weighted base-100 index with per-leg changes", async () => {
    const requests = tokens({ [AAPLX]: (i) => 100 + i, [MSFTX]: () => 200, [NVDAX]: (i) => 50 - i * 0.1 });
    const chart = await bagChart(megacap, "1W", now);
    expect(chart).toMatchObject({ bagId: "megacap-builders", range: "1W", interval: "1H", source: "tokens.xyz", reason: null });
    expect(requests.filter((request) => request.path.endsWith("/price-chart")).map((request) => request.params.interval)).toEqual(["1H", "1H", "1H"]);
    expect(chart.points).toHaveLength(169);
    expect(chart.points[0]!.value).toBe(100);
    expect(chart.points[1]!.value).toBeCloseTo(0.35 * 101 + 0.35 * 100 + 0.3 * 99.8, 3); // AAPL +1%, MSFT flat, NVDA -0.2%
    expect(chart.change!.pct).toBeCloseTo((chart.points[168]!.value / 100 - 1) * 100, 3);
    expect(chart.legs).toEqual([
      { mint: AAPLX, symbol: "AAPLx", weight: 0.35, weightBps: 3500, change: { pct: 168 }, ok: true, reason: null },
      { mint: MSFTX, symbol: "MSFTx", weight: 0.35, weightBps: 3500, change: { pct: 0 }, ok: true, reason: null },
      { mint: NVDAX, symbol: "NVDAx", weight: 0.3, weightBps: 3000, change: { pct: expect.closeTo(-33.6, 3) }, ok: true, reason: null },
    ]);
    // Cached 60s per (bag, range): a second call does not hit the provider again.
    const before = requests.length;
    expect(await bagChart(megacap, "1W", now)).toEqual(chart);
    expect(requests.length).toBe(before);
  });
  it("excludes failed legs from the index (reported ok:false), renormalising weights over the rest", async () => {
    tokens({ [AAPLX]: (i) => 100 + i, [MSFTX]: () => 200 }, { fail: [NVDAX] });
    const chart = await bagChart(megacap, "1M", now);
    expect(chart.reason).toBeNull(); expect(chart.interval).toBe("4H");
    expect(chart.legs.map((leg) => [leg.symbol, leg.ok, leg.reason])).toEqual([["AAPLx", true, null], ["MSFTx", true, null], ["NVDAx", false, "unavailable"]]);
    expect(chart.points[1]!.value).toBeCloseTo(0.5 * 101 + 0.5 * 100, 3);
  });
  it("responds with empty points and a typed reason when the key is missing, every leg fails, or the bag is research-only", async () => {
    delete process.env.TOKENS_API_KEY;
    let chart = await bagChart(megacap, "1D", now);
    expect(chart).toMatchObject({ points: [], change: null, reason: "unconfigured" });
    expect(chart.legs.every((leg) => !leg.ok && leg.reason === "unconfigured")).toBe(true);
    process.env.TOKENS_API_KEY = "tk-test"; resetChartCache();
    tokens({}, { fail: [AAPLX, MSFTX, NVDAX] });
    expect(await bagChart(megacap, "1D", now)).toMatchObject({ points: [], reason: "unavailable" });
    resetChartCache(); resetTokensApiCache();
    process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX}`;
    const requests = tokens({ [AAPLX]: (i) => 100 + i });
    chart = await bagChart(megacap, "1D", now);
    expect(chart.reason).toBeNull(); // one tradable leg still charts; research-only legs are flagged
    expect(chart.legs.map((leg) => [leg.mint, leg.ok, leg.reason])).toEqual([[AAPLX, true, null], [null, false, "not_tradable"], [null, false, "not_tradable"]]);
    expect(requests.filter((request) => request.path.endsWith("/price-chart"))).toHaveLength(1);
    delete process.env.STOCKPILE_ALLOWED_MINTS; resetChartCache();
    expect(await bagChart(megacap, "1D", now)).toMatchObject({ points: [], reason: "not_tradable" });
  });
});

describe("sparklines", () => {
  it("returns a 24h hourly index per bag in one batched, 5-minute-cached call; research-only bags get empty arrays", async () => {
    const requests = tokens({ [AAPLX]: (i) => 100 + i, [MSFTX]: () => 200, [NVDAX]: () => 50 });
    const result = await sparklines(now);
    expect(result).toMatchObject({ range: "1D", interval: "1H", source: "tokens.xyz", reason: null });
    expect(Object.keys(result.sparklines).sort()).toEqual(bags.map((bag) => bag.id).sort());
    expect(result.sparklines["megacap-builders"]).toHaveLength(25);
    expect(result.sparklines["megacap-builders"]![24]!.value).toBeCloseTo(0.35 * 124 + 0.35 * 100 + 0.3 * 100, 3);
    expect(result.sparklines["frontier-ai-labs"]).toEqual([]); // PreStocks disabled -> research-only
    expect(new Set(requests.map((request) => request.params.interval).filter(Boolean))).toEqual(new Set(["1H"]));
    const before = requests.length;
    await sparklines(now);
    expect(requests.length).toBe(before);
    delete process.env.TOKENS_API_KEY;
    expect(await sparklines(now)).toMatchObject({ reason: "unconfigured", sparklines: { "megacap-builders": [] } });
  });
});
