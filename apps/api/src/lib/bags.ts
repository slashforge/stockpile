import { assetIcon } from "./token-icons";
import { issuerAsset } from "./issuer-assets";
import { PRESTOCKS_DISCLAIMER, preStock, preStocksDirectory, type PreStock } from "./prestocks";
import { knownMint, seededMint, verifyListedMint } from "./mint-registry";
import { xStockListing } from "./xstocks";
import { assetMarket, bagMarket, liquidityTier, scaledUiMultiplier, trackMints, type AssetMarket } from "./market";
import { congressConsensus, loadDisclosures, pelosiTracker, tickerToSymbol, type Evidence, type TrackerAsset } from "./congress";

export type Issuer = "xstocks" | "prestocks";
export type AssetClass = "public-equity" | "pre-ipo";
export type BagSource = { title: string; url: string };
export type BagAssetDefinition = { symbol: string; name: string; weightBps: number; sourceUrl: string; underlyingTicker?: string; evidence?: Evidence[] };
export type Curator = { kind: "person" | "aggregate" | "editorial"; name: string; description: string };
export type Bag = {
  id: string; title: string; subtitle: string; description: string; thesis: string; disclosure: string;
  sourceType: "editorial" | "disclosure"; issuer: Issuer; assetClass: AssetClass; curator: Curator; risks: string[]; sources: BagSource[]; assets: BagAssetDefinition[];
  /** Data-driven bags compute assets at request time from persisted disclosures; `minAssets` gates tradability. */
  tracker?: { kind: "pelosi" | "consensus"; minAssets: number };
};
export type Reference = { markPrice: number; tokenPrice: number; impliedValuation: number; asOf: string };
export type ResolvedAsset = { mint: string | null; decimals: number | null; uiAmountMultiplier: number; issuer: Issuer; assetClass: AssetClass; reference: Reference | null; issuerIconUrl: string | null; issuerMint: string | null };

const xstocks = "https://xstocks.fi/products";
const xstocksSource = { title: "xStocks product directory and eligibility disclosure", url: xstocks };
const xstocksDisclosure = "Editorial selection, not investment advice. xStocks are restricted in some jurisdictions and have issuer and liquidity risks; token prices may diverge from equities. No performance is implied.";
const xstocksRisks = [
  "xStocks are tokenized certificates tracking listed equities; holders do not own the underlying shares or hold voting rights.",
  "xStocks are restricted in some jurisdictions and unavailable to U.S. persons; eligibility is set by the issuer.",
  "On-chain liquidity is thin for some tokens; quotes can show measurable price impact and prices can diverge from exchange prices, especially outside market hours.",
  "Editorial bag composition and weights are Stockpile's own inference, not issuer views or recommendations.",
];
const prestocks = "https://prestocks.com/products";
const prestocksSource = { title: "PreStocks products directory and disclaimer", url: prestocks };
const prestocksDisclosure = `Editorial selection, not investment advice. ${PRESTOCKS_DISCLAIMER} Prices are issuer-reported marks for private companies, not market quotes.`;
const prestocksRisks = [
  "PreStocks tokens are backed 1:1 by SPV exposure that tracks the price of a private company; they provide only economic exposure and confer no ownership, voting, dividend, information, or other legal rights (PreStocks disclaimer).",
  "PreStocks are not available in the U.S., to U.S. persons, or to other ineligible persons (PreStocks disclaimer).",
  "There is no guaranteed secondary-market liquidity: on-chain pools are thin, so even small USDC buys can show 1-3% price impact and exit may be slow or costly (PreStocks disclaimer; Stockpile live quotes).",
  "Private-company marks are issuer-reported, not exchange prices; the companies are not affiliated with PreStocks and may never list publicly. Total loss is possible (PreStocks disclaimer).",
  "Some PreStocks tokens (for example OPENAI and SPACEX) use Token-2022 scaled UI amounts after split-style adjustments: raw on-chain units differ from wallet-displayed units by the multiplier shown on the asset.",
  "Editorial bag composition and weights are Stockpile's own inference, not issuer views or recommendations.",
];
const product = (slug: string) => `https://prestocks.com/${slug}`;
const editorialCurator: Curator = { kind: "editorial", name: "Stockpile Editorial", description: "Hand-picked by the Stockpile team from issuer product directories; weights are editorial, not recommendations." };
const disclosureDisclosure = "Built from STOCK Act periodic transaction reports (public House Clerk / Senate eFD filings via CongressInvests). These are disclosed trades, reported 30-45 days after the transaction, in dollar ranges rather than exact amounts, and often made by a spouse or dependent. This is not a live portfolio, not an endorsement by any member of Congress, and not investment advice. Assets are xStocks tokens tracking the disclosed tickers; xStocks restrictions and risks apply.";
const disclosureRisks = [
  "Disclosures lag the actual trade by 30-45 days (STOCK Act deadline), so the bag reflects past filings, not current positions.",
  "Filings report dollar ranges, not exact amounts; weights use range midpoints and can be dominated by a single large filing.",
  "Reported trades frequently belong to a spouse or dependent child, and may include options rather than shares.",
  "Members are not affiliated with Stockpile and do not endorse this bag; filings are public records used under House Clerk usage terms.",
  ...xstocksRisks.slice(0, 3),
];
const clerk = { title: "House Clerk financial disclosures (PTR search)", url: "https://disclosures-clerk.house.gov/FinancialDisclosure" };
const efd = { title: "Senate electronic financial disclosures (eFD)", url: "https://efdsearch.senate.gov/search/" };
const congressInvests = { title: "CongressInvests API (normalised STOCK Act filings)", url: "https://congressinvests.com" };
// xStocks asset definitions. Every symbol here passed `apps/api/scripts/probe-xstocks.ts` on 2026-09-25 (10 USDC Jupiter quote
// routes with <= 2.5% price impact, Tokens V2 verified, pool TVL >= $500, implied price within 10% of Jupiter's usdPrice).
// Re-run the probe before adding a symbol; ARMx, V/MA/PYPL and every defense/pharma/pure-software name failed that gate on that date.
// AMDx, AVGOx and NFLXx sit at ~2% impact (borderline, admitted under the 2.5% gate).
const xs = (ticker: string, company: string, weightBps: number): BagAssetDefinition => ({ symbol: `${ticker}x`, underlyingTicker: ticker, name: `${company} xStock`, weightBps, sourceUrl: xstocks });

export const bags: Bag[] = [
  {
    id: "megacap-builders", title: "Megacap Builders", subtitle: "Platforms behind everyday computing",
    description: "An editorial look at the seven largest U.S. technology companies represented by xStocks tokens: Apple, Microsoft, NVIDIA, Alphabet, Amazon, Meta, and Tesla.",
    thesis: "Stockpile editorial inference: these companies span devices, software, advertising, cloud, and compute infrastructure, and their tokens are the deepest xStocks pools on Solana. Weights lean toward the most liquid tokens; inclusion and weights are not supplied by the issuer.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "Nasdaq-100 index constituents", url: "https://www.nasdaq.com/market-activity/quotes/nasdaq-ndx-index" }],
    assets: [xs("NVDA", "NVIDIA", 2000), xs("AAPL", "Apple", 1800), xs("MSFT", "Microsoft", 1800), xs("GOOGL", "Alphabet", 1400), xs("AMZN", "Amazon", 1200), xs("META", "Meta Platforms", 1200), xs("TSLA", "Tesla", 600)],
  },
  {
    id: "ai-infrastructure", title: "AI Infrastructure", subtitle: "Hardware, platforms, and compute",
    description: "A thematic editorial bag of tokenized companies that sell the chips, networking silicon, cloud capacity, and data platforms behind AI workloads.",
    thesis: "Stockpile editorial inference: GPU, CPU, and custom-silicon makers (NVIDIA, AMD, Broadcom, Intel) plus the hyperscalers and Palantir may be exposed to demand for AI infrastructure. AMD and Broadcom tokens quote around 2% price impact on a 10 USDC buy, so they carry moderate weights; TSMC, Micron, and Oracle were left out to keep the bag at eight liquid names. This is not an issuer view.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "NVIDIA newsroom", url: "https://nvidianews.nvidia.com/" }, { title: "Microsoft Official Blog", url: "https://blogs.microsoft.com/" }],
    assets: [xs("NVDA", "NVIDIA", 2400), xs("MSFT", "Microsoft", 1400), xs("GOOGL", "Alphabet", 1200), xs("AMZN", "Amazon", 1000), xs("PLTR", "Palantir", 1000), xs("AVGO", "Broadcom", 1000), xs("AMD", "AMD", 1000), xs("INTC", "Intel", 1000)],
  },
  {
    id: "consumer-frontiers", title: "Consumer Frontiers", subtitle: "Commerce, mobility, media, and consumer finance",
    description: "A cross-sector editorial selection of tokenized companies that sell directly to consumers: Amazon, Tesla, Meta, Netflix, McDonald's, Walmart, and Robinhood.",
    thesis: "Stockpile editorial inference: these companies serve different facets of consumer demand, from e-commerce and vehicles to social media, streaming, fast food, groceries, and retail investing. Netflix's token quotes around 2% price impact on a 10 USDC buy and uses a 10x scaled-UI multiplier after the 2025 stock split. Bag composition and weights are our own, not sourced financial recommendations.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "Amazon News", url: "https://www.aboutamazon.com/news" }, { title: "CNBC Retail coverage", url: "https://www.cnbc.com/retail/" }],
    assets: [xs("AMZN", "Amazon", 2200), xs("TSLA", "Tesla", 2200), xs("META", "Meta Platforms", 1600), xs("NFLX", "Netflix", 1200), xs("MCD", "McDonald's", 1200), xs("WMT", "Walmart", 800), xs("HOOD", "Robinhood", 800)],
  },
  {
    id: "crypto-fintech-rails", title: "Crypto & Fintech Rails", subtitle: "Exchanges, stablecoins, treasuries, and consumer fintech",
    description: "An editorial bag of tokenized public companies whose businesses run on crypto or digital-asset rails: Coinbase, Robinhood, Strategy (MicroStrategy), Circle, and Bank of America.",
    thesis: "Stockpile editorial inference: exchange volume, stablecoin issuance, and corporate bitcoin treasuries tie these equities to crypto-market activity, while a large bank anchors the payments side. Visa, Mastercard, and PayPal tokens were excluded because their pools failed our liquidity gate; Bank of America is a small weight for the same reason. This is not an issuer view.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "Coinbase blog", url: "https://www.coinbase.com/blog" }, { title: "Circle newsroom", url: "https://www.circle.com/pressroom" }],
    assets: [xs("COIN", "Coinbase", 2600), xs("HOOD", "Robinhood", 2400), xs("MSTR", "Strategy", 2200), xs("CRCL", "Circle", 2200), xs("BAC", "Bank of America", 600)],
  },
  {
    id: "cloud-software", title: "Cloud & Software", subtitle: "Hyperscale cloud and enterprise data platforms",
    description: "An editorial bag of tokenized cloud and enterprise-software companies: Microsoft, Alphabet, Amazon, Palantir, and Oracle.",
    thesis: "Stockpile editorial inference: the three hyperscalers plus Oracle and Palantir capture enterprise cloud and data-platform spend. Pure-play software names such as Salesforce, ServiceNow, Snowflake, CrowdStrike, Datadog, and MongoDB have xStocks tokens but no routable on-chain liquidity today, so they are excluded. This is not an issuer view.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "Microsoft Official Blog", url: "https://blogs.microsoft.com/" }, { title: "Google Cloud blog", url: "https://cloud.google.com/blog" }],
    assets: [xs("MSFT", "Microsoft", 2800), xs("GOOGL", "Alphabet", 2200), xs("AMZN", "Amazon", 2200), xs("PLTR", "Palantir", 2000), xs("ORCL", "Oracle", 800)],
  },
  {
    id: "everyday-brands", title: "Everyday Brands", subtitle: "Consumer staples: food, drinks, and household goods",
    description: "An editorial bag of tokenized consumer-staples companies: McDonald's, Walmart, Coca-Cola, Procter & Gamble, and PepsiCo.",
    thesis: "Stockpile editorial inference: these businesses sell low-ticket, repeat-purchase goods and have historically been less cyclical than technology. McDonald's and Coca-Cola carry the larger weights because their tokens have the deepest pools; PepsiCo and P&G pools are thin. This is not an issuer view.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "Consumer Staples Select Sector (XLP) holdings", url: "https://www.ssga.com/us/en/intermediary/etfs/the-consumer-staples-select-sector-spdr-fund-xlp" }, { title: "CNBC Retail coverage", url: "https://www.cnbc.com/retail/" }],
    assets: [xs("MCD", "McDonald's", 2800), xs("WMT", "Walmart", 2400), xs("KO", "Coca-Cola", 2400), xs("PG", "Procter & Gamble", 1400), xs("PEP", "PepsiCo", 1000)],
  },
  {
    id: "index-basics", title: "Index Basics", subtitle: "The market in three tokens",
    description: "An editorial bag of the three broadest xStocks ETF tokens: SPYx (S&P 500), QQQx (Nasdaq-100), and GLDx (gold bullion).",
    thesis: "Stockpile editorial inference: a large-cap U.S. equity index, a technology-heavy index, and physical gold are the simplest building blocks for broad exposure, and their tokens are among the deepest xStocks pools on Solana. Three names is deliberately fewer than our other bags; the ETFs themselves hold hundreds of stocks or bullion. This is not an issuer view or a recommendation.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", curator: editorialCurator, risks: xstocksRisks,
    sources: [xstocksSource, { title: "SPDR S&P 500 ETF Trust (SPY)", url: "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy" }, { title: "Invesco QQQ Trust (QQQ)", url: "https://www.invesco.com/qqq-etf/en/home.html" }, { title: "SPDR Gold Shares (GLD)", url: "https://www.spdrgoldshares.com/" }],
    assets: [xs("SPY", "SPDR S&P 500 ETF", 5000), xs("QQQ", "Invesco QQQ", 3000), xs("GLD", "SPDR Gold Shares", 2000)],
  },
  {
    id: "frontier-ai-labs", title: "Frontier AI Labs", subtitle: "Pre-IPO exposure to model, robotics, and neural-interface labs",
    description: "An editorial bag of PreStocks tokens tracking private AI companies: OpenAI, Anthropic, Figure AI, and Neuralink.",
    thesis: "Stockpile editorial inference: frontier model labs and embodied-AI companies are raising at rising private marks, and PreStocks is the only issuer whose SPV tokens are used here. Weights favour the two model labs; this is not an issuer view or a forecast.",
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", curator: editorialCurator, risks: prestocksRisks,
    sources: [prestocksSource, { title: "PreStocks: OpenAI product page", url: product("openai") }, { title: "PreStocks: Anthropic product page", url: product("anthropic") }, { title: "PreStocks: Figure AI product page", url: product("figureai") }, { title: "PreStocks: Neuralink product page", url: product("neuralink") },
      { title: "Anthropic newsroom", url: "https://www.anthropic.com/news" }, { title: "Figure AI news", url: "https://www.figure.ai/news" }, { title: "Neuralink updates", url: "https://neuralink.com/updates/" }, { title: "TechCrunch AI coverage", url: "https://techcrunch.com/category/artificial-intelligence/" }],
    assets: [
      { symbol: "OPENAI", name: "OpenAI PreStocks", weightBps: 3500, sourceUrl: product("openai") },
      { symbol: "ANTHROPIC", name: "Anthropic PreStocks", weightBps: 3500, sourceUrl: product("anthropic") },
      { symbol: "FIGUREAI", name: "Figure AI PreStocks", weightBps: 1500, sourceUrl: product("figureai") },
      { symbol: "NEURALINK", name: "Neuralink PreStocks", weightBps: 1500, sourceUrl: product("neuralink") },
    ],
  },
  {
    id: "prediction-markets", title: "Prediction Markets", subtitle: "Pre-IPO exposure to event-contract venues",
    description: "An editorial bag of PreStocks tokens tracking the two largest private prediction-market operators: Kalshi and Polymarket.",
    thesis: "Stockpile editorial inference: regulated and crypto-native prediction markets are both growing volume and raising private capital. Equal weights reflect editorial uncertainty about which model wins; this is not an issuer view.",
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", curator: editorialCurator, risks: prestocksRisks,
    sources: [prestocksSource, { title: "PreStocks: Kalshi product page", url: product("kalshi") }, { title: "PreStocks: Polymarket product page", url: product("polymarket") }, { title: "Polymarket newsroom", url: "https://news.polymarket.com/" }, { title: "CNBC Technology coverage", url: "https://www.cnbc.com/technology/" }],
    assets: [
      { symbol: "KALSHI", name: "Kalshi PreStocks", weightBps: 5000, sourceUrl: product("kalshi") },
      { symbol: "POLYMARKET", name: "Polymarket PreStocks", weightBps: 5000, sourceUrl: product("polymarket") },
    ],
  },
  {
    id: "defense-space", title: "Defense & Space", subtitle: "Pre-IPO exposure to launch and autonomous defense",
    description: "An editorial bag of PreStocks tokens tracking SpaceX and Anduril.",
    thesis: "Stockpile editorial inference: launch, satellite broadband, and autonomous defense systems are capital-intensive private franchises with government and commercial demand. SpaceX carries the larger weight for scale; this is not an issuer view.",
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", curator: editorialCurator, risks: prestocksRisks,
    sources: [prestocksSource, { title: "PreStocks: SpaceX product page", url: product("spacex") }, { title: "PreStocks: Anduril product page", url: product("anduril") }, { title: "SpaceX updates", url: "https://www.spacex.com/updates/" }, { title: "Anduril press", url: "https://www.anduril.com/press" }],
    assets: [
      { symbol: "SPACEX", name: "SpaceX PreStocks", weightBps: 6000, sourceUrl: product("spacex") },
      { symbol: "ANDURIL", name: "Anduril PreStocks", weightBps: 4000, sourceUrl: product("anduril") },
    ],
  },
  {
    id: "pelosi-tracker", title: "Pelosi Tracker", subtitle: "Purchases disclosed by Rep. Nancy Pelosi in the last 12 months",
    description: "Tokenized versions of the stocks Nancy Pelosi's STOCK Act filings disclosed as purchases in the last 12 months, limited to tickers Stockpile can trade as xStocks and weighted by the midpoint of each disclosed dollar range.",
    thesis: "Follows public disclosures, not a strategy: the bag mirrors what the filings say was bought, weeks or months after the fact. Filings typically describe trades by Paul Pelosi (spouse), often as call options; sales and non-tradable tickers are excluded.",
    disclosure: disclosureDisclosure, sourceType: "disclosure", issuer: "xstocks", assetClass: "public-equity", risks: disclosureRisks,
    curator: { kind: "person", name: "Nancy Pelosi", description: "Representative for California's 11th district. Trades are taken from her periodic transaction reports filed with the House Clerk; they are public disclosures, not a managed portfolio, and she has no affiliation with Stockpile." },
    sources: [clerk, congressInvests], assets: [], tracker: { kind: "pelosi", minAssets: 2 },
  },
  {
    id: "congress-consensus", title: "Congress Consensus", subtitle: "Net-most-bought tickers across all members, last 90 days",
    description: "For each tradable ticker, all disclosed purchases minus sales by members of the House and Senate over the last 90 days (range midpoints); tickers with positive net buying are weighted by that net amount.",
    thesis: "An aggregate of public filings, not a strategy: it shows where members' disclosed money went on net. Ranges, lags and spouse trades make this a rough signal at best.",
    disclosure: disclosureDisclosure, sourceType: "disclosure", issuer: "xstocks", assetClass: "public-equity", risks: disclosureRisks,
    curator: { kind: "aggregate", name: "U.S. Congress (all members)", description: "Aggregated STOCK Act periodic transaction reports from the House Clerk and Senate eFD, normalised by CongressInvests. Public records; no member endorses this bag." },
    sources: [clerk, efd, congressInvests], assets: [], tracker: { kind: "consensus", minAssets: 2 },
  },
];

export function findBag(id: string) { return bags.find((bag) => bag.id === id); }
export const allSymbols = () => new Set([...bags.flatMap((bag) => bag.assets.map((asset) => asset.symbol)), ...Object.values(tickerToSymbol)]);
const fromTracker = (asset: TrackerAsset): BagAssetDefinition => ({ symbol: asset.symbol, name: asset.name, weightBps: asset.weightBps, sourceUrl: asset.sourceUrl, underlyingTicker: asset.ticker, evidence: asset.evidence });

/** Asset definitions for a bag; tracker bags are computed from persisted disclosures (cached 5 min in congress.ts). */
export async function bagAssets(bag: Bag): Promise<BagAssetDefinition[]> {
  if (!bag.tracker) return bag.assets;
  const rows = await loadDisclosures();
  return (bag.tracker.kind === "pelosi" ? pelosiTracker(rows) : congressConsensus(rows)).map(fromTracker);
}
/** Tracker bags with fewer overlapping tickers than `minAssets` stay research-only even when every mint resolves. */
export function trackerBlocked(bag: Bag, assets: BagAssetDefinition[]) { return bag.tracker ? assets.length < bag.tracker.minAssets : false; }

/** Bag symbol for a known mint, if any. */
export function knownSymbol(mint: string): string | null {
  for (const symbol of allSymbols()) if (knownMint(symbol) === mint) return symbol;
  return null;
}

/** Editorial display name for a bag symbol (tracker tickers reuse the editorial xStocks names). */
export function catalogueName(symbol: string): string | null {
  for (const bag of bags) for (const asset of bag.assets) if (asset.symbol === symbol) return asset.name;
  return null;
}

/** IDs of every bag (editorial or tracker) whose current assets include the known mint, in catalogue order. */
export async function bagIdsForMint(mint: string): Promise<string[]> {
  const symbol = knownSymbol(mint);
  if (!symbol) return [];
  const ids: string[] = [];
  for (const bag of bags) if ((await bagAssets(bag)).some((asset) => asset.symbol === symbol)) ids.push(bag.id);
  return ids;
}

/**
 * Resolves the tradable mint for an asset from the issuer's live directory (xStocks per-symbol API / PreStocks directory),
 * then requires Jupiter verification and agreement with any pinned mint, and skips operator-blocked mints. Anything else
 * leaves the asset research-only (`mint: null`).
 */
export async function resolveAsset(bag: Bag, asset: BagAssetDefinition): Promise<ResolvedAsset> {
  if (bag.issuer === "xstocks") {
    const snapshot = issuerAsset(asset.symbol);
    const base = { issuer: "xstocks" as const, assetClass: "public-equity" as const, reference: null };
    const seeded = seededMint(asset.symbol);
    if (seeded) return { ...base, mint: seeded, decimals: snapshot?.decimals ?? null, uiAmountMultiplier: await scaledUiMultiplier(seeded), issuerIconUrl: snapshot?.logoUrl ?? null, issuerMint: snapshot?.mint ?? null };
    const listed = await xStockListing(asset.symbol);
    const icons = { issuerIconUrl: listed?.logoUrl ?? snapshot?.logoUrl ?? null, issuerMint: listed?.mint ?? snapshot?.mint ?? null };
    const resolution = listed ? await verifyListedMint(asset.symbol, listed.mint, "xstocks") : null;
    return resolution
      ? { ...base, ...icons, mint: resolution.mint, decimals: resolution.decimals, uiAmountMultiplier: await scaledUiMultiplier(resolution.mint) }
      : { ...base, ...icons, mint: null, decimals: null, uiAmountMultiplier: 1 };
  }
  const listed: PreStock | null = await preStock(asset.symbol);
  const base = { issuer: "prestocks" as const, assetClass: "pre-ipo" as const, issuerIconUrl: listed?.imageUrl ?? null, issuerMint: listed?.mint ?? null };
  const asOf = (await preStocksDirectory())?.asOf ?? null;
  const reference = listed && asOf ? { markPrice: listed.markPrice, tokenPrice: listed.tokenPrice, impliedValuation: listed.impliedValuation, asOf } : null;
  const resolution = listed ? await verifyListedMint(asset.symbol, listed.mint, "prestocks") : null;
  return resolution
    ? { ...base, mint: resolution.mint, decimals: resolution.decimals, uiAmountMultiplier: resolution.uiAmountMultiplier, reference }
    : { ...base, mint: null, decimals: null, uiAmountMultiplier: 1, reference };
}

/** A bag is tradable only when every asset resolves to a verified mint (and tracker bags meet their overlap minimum). */
export async function isTradable(bag: Bag) {
  const assets = await bagAssets(bag);
  if (!assets.length || trackerBlocked(bag, assets)) return false;
  for (const asset of assets) if (!(await resolveAsset(bag, asset)).mint) return false;
  return true;
}

export type PublicAsset = BagAssetDefinition & ResolvedAsset & { evidence: Evidence[]; market: AssetMarket | null; liquidityTier: ReturnType<typeof liquidityTier>; iconUrl: string | null; iconSource: "jupiter-token" | "issuer-token" | "underlying-brand" | null; brandColor: string | null };

export async function publicBag(bag: Bag) {
  const definitions = await bagAssets(bag);
  const assets: PublicAsset[] = await Promise.all(definitions.map(async (asset) => {
    const resolved = await resolveAsset(bag, asset);
    const [icon, market] = await Promise.all([
      assetIcon(asset.symbol, resolved.issuerMint ?? resolved.mint, resolved.issuerIconUrl),
      assetMarket(resolved.mint, { underlyingTicker: asset.underlyingTicker ?? null, mark: resolved.reference ? { price: resolved.reference.markPrice, asOf: resolved.reference.asOf } : null }),
    ]);
    return { ...asset, evidence: asset.evidence ?? [], ...resolved, market, liquidityTier: liquidityTier(market?.liquidityUsd ?? null, market?.probe?.priceImpactPct ?? null), ...icon };
  }));
  const blocked = trackerBlocked(bag, definitions);
  const tradable = assets.length > 0 && !blocked && assets.every((asset) => asset.mint !== null);
  const { tracker, ...rest } = bag;
  const tradableReason = !assets.length ? "No qualifying disclosures found yet" : blocked ? `Research-only: only ${assets.length} disclosed ticker${assets.length === 1 ? "" : "s"} overlap tradable xStocks (minimum ${tracker!.minAssets})` : tradable ? null : "One or more assets have no verified mint";
  return { ...rest, tradable, tradableReason, market: bagMarket(assets), assets };
}

/** Registers every known issuer mint with the market cache so one batched refresh covers all bags. */
export function trackAllMints() {
  const mints = new Set<string>();
  for (const symbol of allSymbols()) { const mint = knownMint(symbol); if (mint) mints.add(mint); }
  trackMints(mints);
  return mints;
}
