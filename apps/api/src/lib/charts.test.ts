import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { assetChart, bagChart, bagIndex, bagReturns, rangeConfig, resetChartCache, sparklines } from "./charts";
import { bags } from "./bags";
import { resetTokensApiCache, type Candle } from "./tokens-api";

const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", MSFTX = "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const now = new Date("2026-09-25T12:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);
const originalFetch = globalThis.fetch;
const original = { tokens: process.env.TOKENS_API_KEY, mints: process.env.STOCKPILE_ALLOWED_MINTS, market: process.env.STOCKPILE_MARKET, prestocks: process.env.STOCKPILE_PRESTOCKS };
// Three-leg fixture with the classic 35/35/30 weights; bagChart takes the bag object, so index maths below stays exact.
const real = bags.find((bag) => bag.id === "megacap-builders")!;
const megacap = { ...real, assets: [{ symbol: "AAPLx", underlyingTicker: "AAPL", name: "Apple xStock", weightBps: 3500, sourceUrl: "https://xstocks.fi/products" }, { symbol: "MSFTx", underlyingTicker: "MSFT", name: "Microsoft xStock", weightBps: 3500, sourceUrl: "https://xstocks.fi/products" }, { symbol: "NVDAx", underlyingTicker: "NVDA", name: "NVIDIA xStock", weightBps: 3000, sourceUrl: "https://xstocks.fi/products" }] };
const weightOf = (symbol: string) => real.assets.find((asset) => asset.symbol === symbol)!.weightBps;
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
  it("maps ranges like riven-cash (1D->15m/24h, 1W->1H/7d, 1M->4H/30d, 1Y->1D/365d, ALL->1D over two years) and returns sorted closes with abs/pct change", async () => {
    expect(rangeConfig).toEqual({ "1D": { interval: "15m", seconds: 86400 }, "1W": { interval: "1H", seconds: 7 * 86400 }, "1M": { interval: "4H", seconds: 30 * 86400 }, "1Y": { interval: "1D", seconds: 365 * 86400, requireAllLegs: true }, ALL: { interval: "1D", seconds: 730 * 86400, requireAllLegs: true } });
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
  it("with requireAllLegs starts the index at the first bucket where every leg has a close (late listings shorten the window instead of counting flat)", () => {
    const legs = [
      { weightBps: 5000, candles: [candle(86400, 10), candle(2 * 86400, 20), candle(3 * 86400, 30)] },
      { weightBps: 5000, candles: [candle(2 * 86400, 100), candle(3 * 86400, 50)] }, // listed a day later
    ];
    expect(bagIndex(legs, "1D")).toEqual([{ t: 86400, value: 100 }, { t: 2 * 86400, value: 150 }, { t: 3 * 86400, value: 175 }]); // tolerant: leg 2 flat 100 on day 1
    expect(bagIndex(legs, "1D", { requireAllLegs: true })).toEqual([{ t: 2 * 86400, value: 100 }, { t: 3 * 86400, value: 0.5 * 150 + 0.5 * 50 }]);
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
    // Only the three allowlisted legs chart; research-only legs get weight 0 so the index renormalises over the rest.
    const total = weightOf("AAPLx") + weightOf("MSFTx") + weightOf("NVDAx");
    expect(result.sparklines["megacap-builders"]![24]!.value).toBeCloseTo((weightOf("AAPLx") * 124 + weightOf("MSFTx") * 100 + weightOf("NVDAx") * 100) / total, 3);
    expect(result.sparklines["frontier-ai-labs"]).toEqual([]); // PreStocks disabled -> research-only
    expect(new Set(requests.map((request) => request.params.interval).filter(Boolean))).toEqual(new Set(["1H"]));
    const before = requests.length;
    await sparklines(now);
    expect(requests.length).toBe(before);
    delete process.env.TOKENS_API_KEY;
    expect(await sparklines(now)).toMatchObject({ reason: "unconfigured", sparklines: { "megacap-builders": [] } });
  });
});

describe("bag returns", () => {
  const SPYX = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", QQQX = "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", GLDX = "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re";
  const indexBasics = bags.find((bag) => bag.id === "index-basics")!;
  // The mock emits one candle per interval step from the requested window start; SPY rises 0.1 per step, the others are flat.
  const prices = { [SPYX]: (i: number) => 100 + i * 0.1, [QQQX]: () => 200, [GLDX]: () => 50 };
  it("reports exactly bagChart's change for 1M / 1Y / ALL (same candles, interval, window and leg rule as the detail screen)", async () => {
    process.env.STOCKPILE_ALLOWED_MINTS = `SPYx:${SPYX},QQQx:${QQQX},GLDx:${GLDX}`;
    const requests = tokens(prices);
    const result = await bagReturns(now);
    expect(result).toMatchObject({ source: "tokens.xyz", interval: "1D", reason: null });
    expect(Object.keys(result.returns).sort()).toEqual(bags.map((bag) => bag.id).sort());
    const index = result.returns["index-basics"]!;
    const [month, year, all] = await Promise.all([bagChart(indexBasics, "1M", now), bagChart(indexBasics, "1Y", now), bagChart(indexBasics, "ALL", now)]);
    expect(index["1M"]).toBe(month.change!.pct);
    expect(index["1Y"]).toBe(year.change!.pct);
    expect(index.ALL).toBe(all.change!.pct);
    expect(index.since).toBe(new Date(all.points[0]!.t * 1000).toISOString());
    // 1M chart: 4H candles over 30 days, SPY +0.1 per step for 180 steps; half the bag is SPY, the rest flat.
    expect(index["1M"]).toBeCloseTo(0.5 * ((100 + 180 * 0.1) / 100 - 1) * 100, 3);
    expect(month.interval).toBe("4H");
    // 1Y and ALL both come from the two-year daily fetch (clipped), so 1Y starts 365 days in: SPY 136.5 -> 172.9.
    expect(index["1Y"]).toBeCloseTo(0.5 * (172.9 / 136.5 - 1) * 100, 3);
    expect(index.ALL).toBeCloseTo(0.5 * (172.9 / 100 - 1) * 100, 3);
    expect(year.points[0]!.t).toBe(Math.ceil((nowSec - 365 * 86400) / 86400) * 86400);
    // Sparkline is the 1M index thinned to one point per day (first 4H bucket of each day, plus the final point).
    expect(index.sparkline1M).toHaveLength(32); // window 12:00 -> 12:00 touches 31 calendar days, plus the final 12:00 point
    expect(index.sparkline1M[0]).toEqual(month.points[0]);
    expect(index.sparkline1M[31]).toEqual(month.points[month.points.length - 1]);
    expect(new Set(index.sparkline1M.slice(0, 31).map((point) => Math.floor(point.t / 86400))).size).toBe(31);
    // Upstream: one 4H/30d call and one 1D/2y call per distinct mint; 1Y never fetches its own window.
    const charts = requests.filter((request) => request.path.endsWith("/price-chart") && [SPYX, QQQX, GLDX].includes(request.params.mint!));
    expect(charts.map((request) => [request.params.interval, request.params.from]).sort()).toEqual([["1D", String(nowSec - 730 * 86400)], ["1D", String(nowSec - 730 * 86400)], ["1D", String(nowSec - 730 * 86400)], ["4H", String(nowSec - 30 * 86400)], ["4H", String(nowSec - 30 * 86400)], ["4H", String(nowSec - 30 * 86400)]]);
    const before = requests.length;
    expect(await bagReturns(now)).toEqual(result);
    expect(requests.length).toBe(before);
  });
  it("shortens a window with a late-listed leg exactly like the chart does, and fails soft like the chart", async () => {
    process.env.STOCKPILE_ALLOWED_MINTS = `SPYx:${SPYX},QQQx:${QQQX},GLDx:${GLDX}`;
    tokens({ ...prices, [GLDX]: (i) => (i < 700 ? 0 : 50) }); // close 0 -> candle dropped: on the daily series GLD has 30 days of history
    const result = await bagReturns(now);
    const index = result.returns["index-basics"]!;
    const [year, all] = await Promise.all([bagChart(indexBasics, "1Y", now), bagChart(indexBasics, "ALL", now)]);
    const listed = Math.ceil((nowSec - 730 * 86400) / 86400) * 86400 + 700 * 86400;
    expect(index.since).toBe(new Date(listed * 1000).toISOString());
    expect(index["1Y"]).toBe(year.change!.pct); expect(index.ALL).toBe(all.change!.pct);
    expect(year.points[0]!.t).toBe(listed); expect(index["1Y"]).toBe(index.ALL); // requireAllLegs: both start on GLD's first day
    resetChartCache(); resetTokensApiCache();
    tokens({}, { fail: [SPYX, QQQX, GLDX] });
    expect(await bagReturns(now)).toMatchObject({ reason: "unavailable", returns: { "index-basics": { "1M": null, "1Y": null, ALL: null, since: null, sparkline1M: [] } } });
    delete process.env.TOKENS_API_KEY; resetChartCache();
    expect(await bagReturns(now)).toMatchObject({ reason: "unconfigured", asOf: null, returns: { "index-basics": { "1M": null, "1Y": null, ALL: null } } });
  });
});
