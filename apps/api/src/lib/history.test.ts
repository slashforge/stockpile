import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", MSFTX = "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const now = new Date("2026-09-25T12:00:00Z");
const nowSec = Math.floor(now.getTime() / 1000);
// price_snapshots rows served by the mocked DB (hourly, flat), keyed per mint.
let snapshotRows: { mint: string; usdPrice: string; ts: Date }[] = [];
mock.module("@stockpile/core/db", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => snapshotRows, then: (resolve: (rows: unknown) => void) => resolve(snapshotRows) }) }) }), insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }) } }));

const { assetChart, bagHistory, bagIndex, changePct, rangeInterval } = await import("./history");
const { bags } = await import("./bags");
const { resetTokensApiCache } = await import("./tokens-api");
const originalFetch = globalThis.fetch;
const original = { tokens: process.env.TOKENS_API_KEY, mints: process.env.STOCKPILE_ALLOWED_MINTS, market: process.env.STOCKPILE_MARKET, prestocks: process.env.STOCKPILE_PRESTOCKS };
const megacap = bags.find((bag) => bag.id === "megacap-builders")!;
const hour = 3600;

/** tokens.xyz mock: every mint resolves to `<mint>-asset`; candles are hourly closes from `prices[mint]` over the requested window. */
function tokens(prices: Record<string, (i: number) => number>, options: { fail?: string[]; unresolved?: string[] } = {}) {
  const requests: { path: string; params: Record<string, string> }[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requests.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
    if (url.pathname === "/v1/assets/resolve") { const ref = url.searchParams.get("ref")!; return options.unresolved?.includes(ref) ? new Response("nope", { status: 404 }) : Response.json({ assetId: `${ref}-asset`, variant: { mint: ref } }); }
    const mint = url.searchParams.get("mint")!;
    if (options.fail?.includes(mint)) return new Response("down", { status: 503 });
    const from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
    const step = { "15m": 900, "1H": 3600, "4H": 14400, "1D": 86400 }[url.searchParams.get("interval")!]!;
    const candles = []; let i = 0;
    for (let t = Math.ceil(from / step) * step; t <= to; t += step, i++) { const c = prices[mint]!(i); candles.push({ time: t, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 100 }); }
    return Response.json({ assetId: `${mint}-asset`, mint, interval: url.searchParams.get("interval"), from, to, candles });
  }) as unknown as typeof fetch;
  return requests;
}

beforeEach(() => {
  resetTokensApiCache(); snapshotRows = [];
  process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX},MSFTx:${MSFTX},NVDAx:${NVDAX}`; process.env.STOCKPILE_MARKET = "0"; process.env.STOCKPILE_PRESTOCKS = "0"; process.env.TOKENS_API_KEY = "tk-test";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of [["TOKENS_API_KEY", original.tokens], ["STOCKPILE_ALLOWED_MINTS", original.mints], ["STOCKPILE_MARKET", original.market], ["STOCKPILE_PRESTOCKS", original.prestocks]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

describe("bag history from tokens.xyz candles", () => {
  it("maps ranges to intervals, requests one chart per asset and builds a weighted base-100 index from closes", async () => {
    const requests = tokens({ [AAPLX]: (i) => 100 + i, [MSFTX]: (i) => 200, [NVDAX]: (i) => 50 - i * 0.1 });
    const history = await bagHistory(megacap, "7d", now);
    expect(history).toMatchObject({ bagId: "megacap-builders", source: "tokens", range: "7d", interval: "1H", from: nowSec - 7 * 86400, to: nowSec });
    expect(requests.filter((request) => request.path.endsWith("/price-chart")).map((request) => request.params.interval)).toEqual(["1H", "1H", "1H"]);
    expect(history.assets.map((asset) => [asset.symbol, asset.mint, asset.weightBps, asset.candles.length])).toEqual([["AAPLx", AAPLX, 3500, 169], ["MSFTx", MSFTX, 3500, 169], ["NVDAx", NVDAX, 3000, 169]]); // inclusive hourly window
    expect(history.assets[0]!.candles[0]).toMatchObject({ o: 100, h: 101, l: 99, c: 100, v: 100 });
    expect(history.bag).toHaveLength(169);
    expect(history.bag[0]).toEqual({ t: history.assets[0]!.candles[0]!.t, value: 100 });
    // After 1 step: AAPL +1%, MSFT flat, NVDA -0.2% => 0.35*101 + 0.35*100 + 0.30*99.8 = 100.29
    expect(history.bag[1]!.value).toBeCloseTo(100.29, 3);
    expect(history.changePct).toBeCloseTo((history.bag[168]!.value / 100 - 1) * 100, 2);
    expect(history.asOf).toBe(new Date(history.assets[0]!.candles[168]!.t * 1000).toISOString());
    expect(rangeInterval).toEqual({ "24h": "15m", "7d": "1H", "30d": "4H", "1y": "1D" });
    expect((await bagHistory(megacap, "1y", now)).interval).toBe("1D");
  });
  it("aligns the index on common timestamps only and ignores assets' extra candles", () => {
    const candle = (t: number, c: number) => ({ t, o: c, h: c, l: c, c, v: null });
    const index = bagIndex([
      { symbol: "A", mint: "a", weightBps: 5000, candles: [candle(1, 10), candle(2, 11), candle(3, 12)] },
      { symbol: "B", mint: "b", weightBps: 5000, candles: [candle(2, 100), candle(3, 90), candle(4, 80)] },
    ]);
    expect(index).toEqual([{ t: 2, value: 100 }, { t: 3, value: Math.round((12 / 11 * 50 + 90 / 100 * 50) * 1000) / 1000 }]);
    expect(bagIndex([{ symbol: "A", mint: "a", weightBps: 10000, candles: [] }])).toEqual([]);
    expect(changePct([candle(1, 10), candle(2, 12)])).toBeCloseTo(20, 9); expect(changePct([candle(1, 10)])).toBeNull();
  });
  it("falls back to hourly snapshots (flat candles, thinned to the range step, source labelled) when tokens.xyz is unconfigured, fails, or cannot resolve a mint", async () => {
    snapshotRows = [];
    for (let i = 0; i < 48; i++) for (const [mint, price] of [[AAPLX, 100 + i], [MSFTX, 200], [NVDAX, 50]] as const) snapshotRows.push({ mint, usdPrice: String(price), ts: new Date((nowSec - 48 * hour + i * hour) * 1000) });
    delete process.env.TOKENS_API_KEY;
    let history = await bagHistory(megacap, "30d", now);
    expect(history).toMatchObject({ source: "snapshot", interval: "4H" });
    expect(history.assets[0]!.candles).toHaveLength(12); // 48 hourly rows thinned to 4H buckets
    expect(history.assets[0]!.candles[0]).toEqual({ t: nowSec - 48 * hour, o: 100, h: 100, l: 100, c: 100, v: null });
    expect(history.bag).toHaveLength(12);
    expect(history.changePct).toBeGreaterThan(0);
    process.env.TOKENS_API_KEY = "tk-test";
    tokens({ [AAPLX]: () => 1, [MSFTX]: () => 1, [NVDAX]: () => 1 }, { fail: [NVDAX] });
    history = await bagHistory(megacap, "7d", now);
    expect(history.source).toBe("snapshot"); expect(history.assets[2]!.candles).toHaveLength(48);
    resetTokensApiCache();
    tokens({ [AAPLX]: () => 1, [MSFTX]: () => 1, [NVDAX]: () => 1 }, { unresolved: [MSFTX] });
    expect((await bagHistory(megacap, "24h", now)).source).toBe("snapshot");
    // Research-only bag (missing allowlist entry): tokens.xyz is not consulted; the unresolved asset has no candles and the index is empty.
    process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX}`;
    const requests = tokens({ [AAPLX]: () => 1 });
    history = await bagHistory(megacap, "7d", now);
    expect(requests).toHaveLength(0);
    expect(history.assets.map((asset) => asset.candles.length)).toEqual([48, 0, 0]); expect(history.bag).toEqual([]); expect(history.changePct).toBeNull();
  });
  it("serves a single-asset chart with the same fallback semantics", async () => {
    tokens({ [NVDAX]: (i) => 10 + i });
    const chart = await assetChart(NVDAX, "NVDAx", "24h", now);
    expect(chart).toMatchObject({ mint: NVDAX, symbol: "NVDAx", source: "tokens", range: "24h", interval: "15m" });
    expect(chart.candles).toHaveLength(97); expect(chart.changePct).toBeCloseTo((106 / 10 - 1) * 100, 6);
    delete process.env.TOKENS_API_KEY;
    snapshotRows = [{ mint: NVDAX, usdPrice: "12", ts: new Date((nowSec - 2 * hour) * 1000) }];
    expect(await assetChart(NVDAX, "NVDAx", "24h", now)).toMatchObject({ source: "snapshot", candles: [{ c: 12, v: null }], changePct: null, asOf: new Date((nowSec - 2 * hour) * 1000).toISOString() });
  });
});
