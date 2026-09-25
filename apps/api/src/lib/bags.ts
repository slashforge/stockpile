import { assetIcon } from "./token-icons";
import { issuerAsset } from "./issuer-assets";
import { PRESTOCKS_DISCLAIMER, preStock, preStocksDirectory, verifyPreStock, type PreStock } from "./prestocks";
import { base58Mint } from "./constants";

export type Issuer = "xstocks" | "prestocks";
export type AssetClass = "public-equity" | "pre-ipo";
export type BagSource = { title: string; url: string };
export type BagAssetDefinition = { symbol: string; name: string; weightBps: number; sourceUrl: string };
export type Bag = {
  id: string; title: string; subtitle: string; description: string; thesis: string; disclosure: string;
  sourceType: "editorial"; issuer: Issuer; assetClass: AssetClass; risks: string[]; sources: BagSource[]; assets: BagAssetDefinition[];
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

export const bags: Bag[] = [
  {
    id: "megacap-builders", title: "Megacap Builders", subtitle: "Platforms behind everyday computing",
    description: "An editorial look at large technology companies represented by xStocks tokens.",
    thesis: "Stockpile editorial inference: these companies span devices, software, and compute infrastructure. Inclusion and weights are not supplied by the issuer.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", risks: xstocksRisks, sources: [xstocksSource],
    assets: [
      { symbol: "AAPLx", name: "Apple xStock", weightBps: 3500, sourceUrl: xstocks },
      { symbol: "MSFTx", name: "Microsoft xStock", weightBps: 3500, sourceUrl: xstocks },
      { symbol: "NVDAx", name: "NVIDIA xStock", weightBps: 3000, sourceUrl: xstocks },
    ],
  },
  {
    id: "ai-infrastructure", title: "AI Infrastructure", subtitle: "Hardware, platforms, and compute",
    description: "A thematic editorial bag of tokenized technology exposures.",
    thesis: "Stockpile editorial inference: hardware and platform companies may be exposed to demand for AI infrastructure. This is not an issuer view.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", risks: xstocksRisks, sources: [xstocksSource],
    assets: [
      { symbol: "NVDAx", name: "NVIDIA xStock", weightBps: 4000, sourceUrl: xstocks },
      { symbol: "AMDx", name: "AMD xStock", weightBps: 3000, sourceUrl: xstocks },
      { symbol: "GOOGLx", name: "Alphabet xStock", weightBps: 3000, sourceUrl: xstocks },
    ],
  },
  {
    id: "consumer-frontiers", title: "Consumer Frontiers", subtitle: "Commerce, mobility, and entertainment",
    description: "A cross-sector editorial selection of tokenized consumer companies.",
    thesis: "Stockpile editorial inference: these companies serve different facets of consumer demand. Bag composition and weights are our own, not sourced financial recommendations.",
    disclosure: xstocksDisclosure, sourceType: "editorial", issuer: "xstocks", assetClass: "public-equity", risks: xstocksRisks, sources: [xstocksSource],
    assets: [
      { symbol: "AMZNx", name: "Amazon xStock", weightBps: 3500, sourceUrl: xstocks },
      { symbol: "TSLAx", name: "Tesla xStock", weightBps: 3500, sourceUrl: xstocks },
      { symbol: "NFLXx", name: "Netflix xStock", weightBps: 3000, sourceUrl: xstocks },
    ],
  },
  {
    id: "frontier-ai-labs", title: "Frontier AI Labs", subtitle: "Pre-IPO exposure to model, robotics, and neural-interface labs",
    description: "An editorial bag of PreStocks tokens tracking private AI companies: OpenAI, Anthropic, Figure AI, and Neuralink.",
    thesis: "Stockpile editorial inference: frontier model labs and embodied-AI companies are raising at rising private marks, and PreStocks is the only issuer whose SPV tokens are used here. Weights favour the two model labs; this is not an issuer view or a forecast.",
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", risks: prestocksRisks,
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
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", risks: prestocksRisks,
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
    disclosure: prestocksDisclosure, sourceType: "editorial", issuer: "prestocks", assetClass: "pre-ipo", risks: prestocksRisks,
    sources: [prestocksSource, { title: "PreStocks: SpaceX product page", url: product("spacex") }, { title: "PreStocks: Anduril product page", url: product("anduril") }, { title: "SpaceX updates", url: "https://www.spacex.com/updates/" }, { title: "Anduril press", url: "https://www.anduril.com/press" }],
    assets: [
      { symbol: "SPACEX", name: "SpaceX PreStocks", weightBps: 6000, sourceUrl: product("spacex") },
      { symbol: "ANDURIL", name: "Anduril PreStocks", weightBps: 4000, sourceUrl: product("anduril") },
    ],
  },
];

export function findBag(id: string) { return bags.find((bag) => bag.id === id); }
export const allSymbols = () => new Set(bags.flatMap((bag) => bag.assets.map((asset) => asset.symbol)));

// Operators must independently verify issuer mints before adding them to this allowlist.
export function configuredMint(symbol: string): string | null {
  const entry = (process.env.STOCKPILE_ALLOWED_MINTS ?? "").split(",")
    .map((item) => item.trim().split(":"))
    .find(([key]) => key === symbol);
  const mint = entry?.[1];
  return mint && base58Mint.test(mint) ? mint : null;
}

/** Symbol for a configured (allowlisted) mint, if any. */
export function configuredSymbol(mint: string): string | null {
  for (const symbol of allSymbols()) if (configuredMint(symbol) === mint) return symbol;
  return null;
}

/**
 * Resolves the tradable mint for an asset. xStocks: operator allowlist. PreStocks: operator allowlist AND the issuer's
 * current directory entry AND Jupiter verification must all agree on the same mint; otherwise the asset is research-only.
 */
export async function resolveAsset(bag: Bag, asset: BagAssetDefinition): Promise<ResolvedAsset> {
  const allowed = configuredMint(asset.symbol);
  if (bag.issuer === "xstocks") {
    const issuer = issuerAsset(asset.symbol);
    return { mint: allowed, decimals: allowed ? issuer?.decimals ?? null : null, uiAmountMultiplier: 1, issuer: "xstocks", assetClass: "public-equity", reference: null, issuerIconUrl: issuer?.logoUrl ?? null, issuerMint: issuer?.mint ?? null };
  }
  const listed: PreStock | null = await preStock(asset.symbol);
  const base = { issuer: "prestocks" as const, assetClass: "pre-ipo" as const, issuerIconUrl: listed?.imageUrl ?? null, issuerMint: listed?.mint ?? null };
  const asOf = (await preStocksDirectory())?.asOf ?? null;
  const reference = listed && asOf ? { markPrice: listed.markPrice, tokenPrice: listed.tokenPrice, impliedValuation: listed.impliedValuation, asOf } : null;
  if (!listed || !allowed || listed.mint !== allowed) return { ...base, mint: null, decimals: null, uiAmountMultiplier: 1, reference };
  const verification = await verifyPreStock(listed);
  return verification.verified
    ? { ...base, mint: allowed, decimals: verification.decimals, uiAmountMultiplier: verification.uiAmountMultiplier, reference }
    : { ...base, mint: null, decimals: null, uiAmountMultiplier: 1, reference };
}

/** A bag is tradable only when every asset resolves to a verified mint. */
export async function isTradable(bag: Bag) {
  for (const asset of bag.assets) if (!(await resolveAsset(bag, asset)).mint) return false;
  return true;
}

export async function publicBag(bag: Bag) {
  const assets = await Promise.all(bag.assets.map(async (asset) => {
    const resolved = await resolveAsset(bag, asset);
    const icon = await assetIcon(asset.symbol, resolved.issuerMint ?? resolved.mint, resolved.issuerIconUrl);
    return { ...asset, mint: resolved.mint, decimals: resolved.decimals, uiAmountMultiplier: resolved.uiAmountMultiplier, issuer: resolved.issuer, assetClass: resolved.assetClass, reference: resolved.reference, ...icon };
  }));
  return { ...bag, tradable: assets.every((asset) => asset.mint !== null), assets };
}
