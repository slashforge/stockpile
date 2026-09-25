// Market data for bag assets: Jupiter Price v3 (usdPrice, 24h change, scaled-UI multiplier, issuer reference price),
// Jupiter Tokens v2 (liquidity, organic score, holders, 24h volume) and an underlying reference price
// (Pyth Hermes Equity.US.<TICKER>/USD when PYTH_API_KEY is set, else Jupiter's xStocks stock reference; PreStocks mark
// price for pre-IPO). One batched refresh for every mint, cached ~60s, stale-while-revalidate and stale-on-failure.
// Request handlers only read the cache; the first fill happens at startup (index.ts) or on the first read.
// 24h change: Jupiter's `priceChange24h` is a rolling last-trade window that re-anchors on every trade and every trade ageing out,
// so for sparsely traded tokens it can jump several points between refreshes. When our own hourly price_snapshots have a point
// ~24h old (loader wired in index.ts), the change is computed against that fixed reference instead (`change24hSource:"snapshot"`).
// Quote probe: Jupiter `liquidity` is pool TVL, not route depth, so every 5 minutes each mint is quoted for a fixed 10 USDC buy and
// the route's priceImpactPct is exposed as `probe`; tiers and the bag's worst-impact leg use it.
import { base58Mint, USDC } from "./constants";

export type UnderlyingSource = "pyth" | "prestocks" | "jupiter-stock";
export type Underlying = { source: UnderlyingSource; price: number; asOf: string };
export type QuoteProbe = { sizeUsdc: number; priceImpactPct: number; asOf: string };
export type Change24hSource = "snapshot" | "jupiter";
export type AssetMarket = {
  usdPrice: number | null; priceChange24hPct: number | null; change24hSource: Change24hSource | null; liquidityUsd: number | null; organicScore: number | null; organicScoreLabel: string | null;
  holderCount: number | null; volume24hUsd: number | null; underlying: Underlying | null; premiumPct: number | null; probe: QuoteProbe | null; asOf: string;
};
export type LiquidityTier = "deep" | "ok" | "thin";
type MintMarket = { price: number | null; change: number | null; multiplier: number; liquidity: number | null; organicScore: number | null; organicScoreLabel: string | null; holderCount: number | null; volume24h: number | null; stock: { id: string; price: number; asOf: string } | null };
type Snapshot = { mints: Map<string, MintMarket>; pyth: Map<string, { price: number; asOf: string }>; probes: Map<string, QuoteProbe>; reference24h: Map<string, number>; asOf: string };
export type ReferencePriceLoader = (mints: string[]) => Promise<Map<string, number>>;

const ttl = 60 * 1000;
const failureTtl = 20 * 1000;
export const probeSizeUsdc = 10;
const probeTtl = 5 * 60 * 1000;
let probeExpiresAt = 0;
let referenceLoader: ReferencePriceLoader | null = null;
export const pythEquityFeeds: Record<string, string> = {
  AAPL: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", MSFT: "d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  NVDA: "b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", AMD: "3622e381dbca2efd1859253763b1adc63f7f9abb8e76da1aa8e638a57ccde93e",
  GOOGL: "5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6", AMZN: "b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  TSLA: "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", NFLX: "8376cfd7ca8bcdf372ced05307b24dced1f15b1afafdeff715664598f15a3dd2",
};
const trackedMints = new Set<string>();
let snapshot: Snapshot | null = null;
let expiresAt = 0;
let pending: Promise<Snapshot | null> | undefined;

const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function trackMints(mints: Iterable<string>) { for (const mint of mints) if (base58Mint.test(mint)) trackedMints.add(mint); }
/** Wires the price_snapshots reader used for the fixed 24h reference (kept out of this module so it stays DB-free in tests). */
export function configureReferencePrices(loader: ReferencePriceLoader | null) { referenceLoader = loader; }
/** Worse of the pool-TVL tier (deep >= $1M, ok >= $100k) and the probe-impact tier (thin >= 1%, ok >= 0.3%). */
export function liquidityTier(liquidityUsd: number | null, probeImpactPct: number | null = null): LiquidityTier | null {
  const byTvl: LiquidityTier | null = liquidityUsd === null ? null : liquidityUsd >= 1_000_000 ? "deep" : liquidityUsd >= 100_000 ? "ok" : "thin";
  const byImpact: LiquidityTier | null = probeImpactPct === null ? null : probeImpactPct >= 1 ? "thin" : probeImpactPct >= 0.3 ? "ok" : "deep";
  const rank: Record<LiquidityTier, number> = { deep: 0, ok: 1, thin: 2 };
  if (byTvl === null) return byImpact;
  if (byImpact === null) return byTvl;
  return rank[byImpact] > rank[byTvl] ? byImpact : byTvl;
}
export function premiumPct(tokenUsd: number | null, underlyingUsd: number | null): number | null {
  return tokenUsd === null || underlyingUsd === null || underlyingUsd <= 0 ? null : (tokenUsd / underlyingUsd - 1) * 100;
}

function activeMultiplier(config: unknown): number {
  if (!config || typeof config !== "object") return 1;
  const value = config as { multiplier?: unknown; newMultiplier?: unknown; newMultiplierEffectiveAt?: unknown };
  const effective = typeof value.newMultiplierEffectiveAt === "string" ? Date.parse(value.newMultiplierEffectiveAt) : NaN;
  const candidate = Number.isFinite(effective) && effective <= Date.now() ? value.newMultiplier : value.multiplier;
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
}

async function fetchJupiter(mints: string[], key: string): Promise<Map<string, MintMarket>> {
  const headers = { "x-api-key": key };
  const result = new Map<string, MintMarket>();
  for (let i = 0; i < mints.length; i += 50) {
    const batch = mints.slice(i, i + 50);
    const [priceRes, tokenRes] = await Promise.all([
      fetch(`https://api.jup.ag/price/v3?ids=${batch.join(",")}`, { headers, signal: AbortSignal.timeout(6000) }),
      fetch(`https://api.jup.ag/tokens/v2/search?query=${batch.join(",")}`, { headers, signal: AbortSignal.timeout(6000) }),
    ]);
    if (!priceRes.ok) throw new Error(`Jupiter price ${priceRes.status}`);
    const prices = await priceRes.json() as Record<string, { usdPrice?: unknown; priceChange24h?: unknown; liquidity?: unknown; scaledUiConfig?: unknown; stockData?: { id?: unknown; price?: unknown; updatedAt?: unknown } }>;
    const tokens = tokenRes.ok ? await tokenRes.json().catch(() => []) as unknown : [];
    const byId = new Map<string, Record<string, unknown>>();
    if (Array.isArray(tokens)) for (const token of tokens) if (token && typeof token === "object" && typeof (token as { id?: unknown }).id === "string") byId.set((token as { id: string }).id, token as Record<string, unknown>);
    for (const mint of batch) {
      const price = prices?.[mint];
      const token = byId.get(mint);
      const stats = token?.stats24h && typeof token.stats24h === "object" ? token.stats24h as { buyVolume?: unknown; sellVolume?: unknown } : null;
      const buy = num(stats?.buyVolume), sell = num(stats?.sellVolume);
      const stockPrice = num(price?.stockData?.price);
      result.set(mint, {
        price: num(price?.usdPrice), change: num(price?.priceChange24h), multiplier: activeMultiplier(price?.scaledUiConfig),
        liquidity: num(token?.liquidity) ?? num(price?.liquidity), organicScore: num(token?.organicScore), organicScoreLabel: typeof token?.organicScoreLabel === "string" ? token.organicScoreLabel : null,
        holderCount: num(token?.holderCount), volume24h: buy === null && sell === null ? null : (buy ?? 0) + (sell ?? 0),
        stock: stockPrice !== null && typeof price?.stockData?.id === "string" ? { id: price.stockData.id, price: stockPrice, asOf: typeof price.stockData.updatedAt === "string" ? price.stockData.updatedAt : new Date().toISOString() } : null,
      });
    }
  }
  return result;
}

async function fetchPyth(key: string): Promise<Map<string, { price: number; asOf: string }>> {
  const url = new URL("https://hermes.pyth.network/v2/updates/price/latest");
  for (const id of Object.values(pythEquityFeeds)) url.searchParams.append("ids[]", id);
  url.searchParams.set("parsed", "true");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Pyth ${res.status}`);
  const data = await res.json() as { parsed?: { id?: string; price?: { price?: string; expo?: number; publish_time?: number } }[] };
  const byFeed = new Map(Object.entries(pythEquityFeeds).map(([ticker, id]) => [id, ticker]));
  const result = new Map<string, { price: number; asOf: string }>();
  for (const item of data.parsed ?? []) {
    const ticker = item.id ? byFeed.get(item.id.replace(/^0x/, "")) : undefined;
    const raw = Number(item.price?.price), expo = item.price?.expo, time = item.price?.publish_time;
    if (!ticker || !Number.isFinite(raw) || typeof expo !== "number" || typeof time !== "number") continue;
    const price = raw * 10 ** expo;
    if (price > 0) result.set(ticker, { price, asOf: new Date(time * 1000).toISOString() });
  }
  return result;
}

async function fetchProbe(mint: string, key: string): Promise<QuoteProbe | null> {
  const url = new URL("https://api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", USDC); url.searchParams.set("outputMint", mint); url.searchParams.set("amount", String(probeSizeUsdc * 1_000_000));
  url.searchParams.set("slippageBps", "50"); url.searchParams.set("restrictIntermediateTokens", "true");
  const res = await fetch(url, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const quote = await res.json() as { outputMint?: unknown; priceImpactPct?: unknown };
  const impact = Number(quote?.priceImpactPct);
  return quote?.outputMint === mint && Number.isFinite(impact) && impact >= 0 ? { sizeUsdc: probeSizeUsdc, priceImpactPct: impact * 100, asOf: new Date().toISOString() } : null;
}

/** One fixed-size quote per mint, four at a time; a failed probe keeps the previous value. */
async function fetchProbes(mints: string[], key: string, previous: Map<string, QuoteProbe>): Promise<Map<string, QuoteProbe>> {
  const result = new Map(previous);
  for (let i = 0; i < mints.length; i += 4) {
    await Promise.all(mints.slice(i, i + 4).map(async (mint) => { const probe = await fetchProbe(mint, key).catch(() => null); if (probe) result.set(mint, probe); }));
  }
  return result;
}

async function refresh(): Promise<Snapshot> {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new Error("Jupiter is not configured");
  const mints = [...trackedMints];
  const probesDue = probeExpiresAt <= Date.now();
  const [jupiter, pyth, probes, reference24h] = await Promise.all([
    fetchJupiter(mints, key),
    process.env.PYTH_API_KEY ? fetchPyth(process.env.PYTH_API_KEY).catch(() => snapshot?.pyth ?? new Map()) : Promise.resolve(snapshot?.pyth ?? new Map<string, { price: number; asOf: string }>()),
    probesDue ? fetchProbes(mints, key, snapshot?.probes ?? new Map()) : Promise.resolve(snapshot?.probes ?? new Map<string, QuoteProbe>()),
    referenceLoader ? referenceLoader(mints).catch(() => snapshot?.reference24h ?? new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
  ]);
  if (probesDue) probeExpiresAt = Date.now() + probeTtl;
  return { mints: jupiter, pyth, probes, reference24h, asOf: new Date().toISOString() };
}

/** Current snapshot (stale-while-revalidate). Awaits only when nothing has been cached yet. */
export async function marketSnapshot(): Promise<Snapshot | null> {
  if (process.env.STOCKPILE_MARKET === "0" || trackedMints.size === 0) return null;
  if (expiresAt <= Date.now() && !pending) {
    pending = refresh().then((next) => { snapshot = next; expiresAt = Date.now() + ttl; return next; })
      .catch(() => { expiresAt = Date.now() + failureTtl; return snapshot; })
      .finally(() => { pending = undefined; });
  }
  if (!snapshot && pending) await pending;
  return snapshot;
}

/** Token-2022 scaled-UI multiplier from the latest Jupiter price snapshot (1 when unknown). */
export async function scaledUiMultiplier(mint: string): Promise<number> {
  trackMints([mint]);
  return (await marketSnapshot())?.mints.get(mint)?.multiplier ?? 1;
}

/** Market block for one asset; `underlyingTicker` enables Pyth/Jupiter stock reference, `mark` is the PreStocks issuer mark. */
export async function assetMarket(mint: string | null, options: { underlyingTicker?: string | null; mark?: { price: number; asOf: string } | null } = {}): Promise<AssetMarket | null> {
  if (!mint) return null;
  const current = await marketSnapshot();
  const data = current?.mints.get(mint);
  if (!current || !data) return null;
  let underlying: Underlying | null = null;
  if (options.mark) underlying = { source: "prestocks", price: options.mark.price, asOf: options.mark.asOf };
  else if (options.underlyingTicker) {
    const pyth = current.pyth.get(options.underlyingTicker);
    if (pyth) underlying = { source: "pyth", price: pyth.price, asOf: pyth.asOf };
    else if (data.stock && data.stock.id === "xstocks") underlying = { source: "jupiter-stock", price: data.stock.price, asOf: data.stock.asOf };
  }
  const reference = current.reference24h.get(mint);
  const change = data.price !== null && reference !== undefined && reference > 0 ? { value: (data.price / reference - 1) * 100, source: "snapshot" as const } : data.change !== null ? { value: data.change, source: "jupiter" as const } : null;
  return { usdPrice: data.price, priceChange24hPct: change?.value ?? null, change24hSource: change?.source ?? null, liquidityUsd: data.liquidity, organicScore: data.organicScore, organicScoreLabel: data.organicScoreLabel, holderCount: data.holderCount,
    volume24hUsd: data.volume24h, underlying, premiumPct: premiumPct(data.price, underlying?.price ?? null), probe: current.probes.get(mint) ?? null, asOf: current.asOf };
}

export type BagMarket = { change24hPct: number | null; change24hSource: Change24hSource | null; premiumPct: number | null; coverage: number; worstLiquidityUsd: number | null; worstLiquiditySymbol: string | null; worstImpactPct: number | null; worstImpactSymbol: string | null; asOf: string } | null;

/** Weight-averaged bag metrics over legs that have data; coverage = fraction of weight with a price. */
export function bagMarket(assets: { symbol: string; weightBps: number; market: AssetMarket | null }[]): BagMarket {
  const priced = assets.filter((asset) => asset.market?.usdPrice !== null && asset.market?.usdPrice !== undefined);
  if (!priced.length) return null;
  const total = assets.reduce((sum, asset) => sum + asset.weightBps, 0) || 1;
  const average = (pick: (market: AssetMarket) => number | null) => {
    let weight = 0, sum = 0;
    for (const asset of priced) { const value = pick(asset.market!); if (value !== null) { weight += asset.weightBps; sum += value * asset.weightBps; } }
    return weight ? sum / weight : null;
  };
  let worst: { symbol: string; liquidity: number } | null = null;
  let worstImpact: { symbol: string; impact: number } | null = null;
  for (const asset of assets) {
    const liquidity = asset.market?.liquidityUsd ?? null; if (liquidity !== null && (!worst || liquidity < worst.liquidity)) worst = { symbol: asset.symbol, liquidity };
    const impact = asset.market?.probe?.priceImpactPct ?? null; if (impact !== null && (!worstImpact || impact > worstImpact.impact)) worstImpact = { symbol: asset.symbol, impact };
  }
  // The bag's change source is "snapshot" only when every priced leg used the fixed reference; mixed legs are reported as Jupiter's window.
  const changeSources = priced.map((asset) => asset.market!.change24hSource).filter((source): source is Change24hSource => source !== null);
  return { change24hPct: average((market) => market.priceChange24hPct), change24hSource: !changeSources.length ? null : changeSources.every((source) => source === "snapshot") ? "snapshot" : "jupiter",
    premiumPct: average((market) => market.premiumPct), coverage: priced.reduce((sum, asset) => sum + asset.weightBps, 0) / total,
    worstLiquidityUsd: worst?.liquidity ?? null, worstLiquiditySymbol: worst?.symbol ?? null, worstImpactPct: worstImpact?.impact ?? null, worstImpactSymbol: worstImpact?.symbol ?? null, asOf: priced[0]!.market!.asOf };
}

export function resetMarketCache() { snapshot = null; expiresAt = 0; pending = undefined; probeExpiresAt = 0; referenceLoader = null; trackedMints.clear(); }
