// `bun run xstocks:probe [-- --json /tmp/xstocks.json --max-impact 2.5 --min-liquidity 500 --max-deviation 10 TICKER ...]`
// Operator re-verification tool for xStocks bag candidates. For each underlying ticker it looks up the Solana mint in the
// xStocks public directory (https://api.xstocks.fi/api/v2/public/assets, fetched live unless --json points at a cached
// dump of [{s,u,mint}]), checks Jupiter Tokens V2 (8 decimals, Token-2022 program) and requests a 10 USDC -> token quote.
// A ticker passes only when the quote routes, priceImpactPct is at or below the gate, pool TVL is at least --min-liquidity
// (default $500) and the quote's implied price is within --max-deviation (default 10%) of Jupiter's usdPrice: tiny stale pools
// can quote "0% impact" at absurd prices, so impact alone is not a liquidity signal. Read-only; never prints the key.
import { USDC } from "../src/lib/constants";
import { probeSizeUsdc } from "../src/lib/market";

const key = process.env.JUPITER_API_KEY;
if (!key) { console.log("JUPITER_API_KEY is not set; nothing to probe."); process.exit(1); }
const headers = { "x-api-key": key };
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

export const candidates = [
  // megacaps
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "AVGO", "TSLA", "BRK.B", "WMT", "JPM", "XOM", "COST", "HD",
  // semis
  "AMD", "TSM", "MU", "ARM", "SMCI", "INTC", "QCOM", "TXN", "ASML", "MRVL", "LRCX", "AMAT", "KLAC",
  // software / cloud
  "ORCL", "PLTR", "CRM", "ADBE", "NOW", "SNOW", "CRWD", "PANW", "DDOG", "NET", "MDB", "SHOP", "INTU", "IBM", "CSCO", "APP",
  // fintech / crypto rails
  "COIN", "HOOD", "MSTR", "CRCL", "PYPL", "V", "MA", "SQ", "SOFI", "AXP", "GS", "BAC",
  // consumer
  "NFLX", "UBER", "ABNB", "NKE", "SBUX", "MCD", "DIS", "KO", "PEP", "PG", "CMG", "TGT", "LULU", "SPOT", "RBLX",
  // healthcare / pharma
  "LLY", "UNH", "JNJ", "ABBV", "MRK", "PFE", "NVO", "ISRG", "TMO", "ABT", "AMGN", "GILD",
  // defense / aerospace / industrial
  "LMT", "RTX", "NOC", "RKLB", "BA", "GE", "HON", "GD", "LHX", "CAT", "DE",
  // energy
  "CVX", "COP", "OXY", "SLB",
  // indexes / commodities
  "SPY", "QQQ", "VTI", "IWM", "GLD", "DIA", "TLT",
];

type Directory = { s: string; u: string; mint: string }[];
type Row = { ticker: string; symbol: string | null; mint: string | null; verified: boolean; decimals: number | null; program: string | null; routes: boolean; priceImpactPct: number | null; outAmount: string | null; liquidityUsd: number | null; usdPrice: number | null; impliedPrice: number | null; error: string | null };

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const maxImpact = Number(flag("--max-impact") ?? 2.5);
const minLiquidity = Number(flag("--min-liquidity") ?? 500);
const maxDeviation = Number(flag("--max-deviation") ?? 10);
const jsonPath = flag("--json");
const valued = new Set(["--json", "--max-impact", "--min-liquidity", "--max-deviation"]);
const only = args.filter((arg, i) => !arg.startsWith("--") && !valued.has(args[i - 1] ?? ""));
const tickers = only.length ? only : candidates;

async function directory(): Promise<Directory> {
  if (jsonPath) return await Bun.file(jsonPath).json() as Directory;
  const out: Directory = [];
  for (let page = 1; page < 30; page++) {
    const res = await fetch(`https://api.xstocks.fi/api/v2/public/assets?limit=100&page=${page}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`xStocks directory ${res.status}`);
    const data = await res.json() as { nodes?: { symbol?: string; underlyingSymbol?: string; deployments?: { network?: string; address?: string }[] }[] };
    const nodes = data.nodes ?? [];
    for (const node of nodes) {
      const sol = node.deployments?.find((d) => d.network === "Solana")?.address;
      if (node.symbol && sol) out.push({ s: node.symbol, u: node.underlyingSymbol ?? node.symbol.replace(/x$/, ""), mint: sol });
    }
    if (nodes.length < 100) break;
  }
  return out;
}

// Tokens V2 for decimals/program/TVL/usdPrice; Price V3 for the Token-2022 scaled-UI multiplier (e.g. NFLXx is 10x after the
// Netflix split, so raw outAmount must be scaled before comparing the implied price with usdPrice).
async function tokenInfo(mint: string) {
  const [res, priceRes] = await Promise.all([
    fetch(`https://api.jup.ag/tokens/v2/search?query=${mint}`, { headers, signal: AbortSignal.timeout(8000) }),
    fetch(`https://api.jup.ag/price/v3?ids=${mint}`, { headers, signal: AbortSignal.timeout(8000) }),
  ]);
  if (!res.ok) throw new Error(`tokens v2 ${res.status}`);
  const tokens = await res.json() as { id?: string; decimals?: number; tokenProgram?: string; liquidity?: number; usdPrice?: number }[];
  const token = tokens.find((t) => t.id === mint);
  const price = priceRes.ok ? (await priceRes.json() as Record<string, { scaledUiConfig?: { multiplier?: number; newMultiplier?: number; newMultiplierEffectiveAt?: string } }>)[mint] : undefined;
  const config = price?.scaledUiConfig;
  const effective = config?.newMultiplierEffectiveAt ? Date.parse(config.newMultiplierEffectiveAt) : NaN;
  const multiplier = (Number.isFinite(effective) && effective <= Date.now() ? config?.newMultiplier : config?.multiplier) ?? 1;
  return token ? { decimals: token.decimals ?? null, program: token.tokenProgram ?? null, liquidity: typeof token.liquidity === "number" ? token.liquidity : null, usdPrice: typeof token.usdPrice === "number" ? token.usdPrice : null, multiplier: multiplier > 0 ? multiplier : 1 } : null;
}

async function quote(mint: string) {
  const url = new URL("https://api.jup.ag/swap/v1/quote");
  url.searchParams.set("inputMint", USDC); url.searchParams.set("outputMint", mint); url.searchParams.set("amount", String(probeSizeUsdc * 1_000_000));
  url.searchParams.set("slippageBps", "50"); url.searchParams.set("restrictIntermediateTokens", "true");
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new Error("quote 429");
  if (!res.ok) return { routes: false, impact: null, outAmount: null, error: `quote ${res.status}` };
  const data = await res.json() as { outputMint?: string; priceImpactPct?: string; outAmount?: string };
  const impact = Number(data.priceImpactPct);
  return data.outputMint === mint && Number.isFinite(impact) ? { routes: true, impact: impact * 100, outAmount: data.outAmount ?? null, error: null } : { routes: false, impact: null, outAmount: null, error: "no route" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; await sleep(600 * (i + 1)); } }
  throw last;
}

async function probe(ticker: string, dir: Directory): Promise<Row> {
  const entry = dir.find((d) => d.u === ticker) ?? dir.find((d) => d.s === `${ticker}x`);
  const base: Row = { ticker, symbol: entry?.s ?? null, mint: entry?.mint ?? null, verified: false, decimals: null, program: null, routes: false, priceImpactPct: null, outAmount: null, liquidityUsd: null, usdPrice: null, impliedPrice: null, error: null };
  if (!entry) return { ...base, error: "not in xStocks directory" };
  try {
    const [info, q] = await Promise.all([withRetry(() => tokenInfo(entry.mint)), withRetry(() => quote(entry.mint))]);
    const out = q.outAmount ? Number(q.outAmount) / 10 ** (info?.decimals ?? 8) * (info?.multiplier ?? 1) : 0;
    return { ...base, verified: info?.decimals === 8 && info.program === TOKEN_2022, decimals: info?.decimals ?? null, program: info?.program ?? null, liquidityUsd: info?.liquidity ?? null, usdPrice: info?.usdPrice ?? null, impliedPrice: out > 0 ? probeSizeUsdc / out : null, routes: q.routes, priceImpactPct: q.impact, outAmount: q.outAmount, error: q.error };
  } catch (e) { return { ...base, error: e instanceof Error ? e.message : String(e) }; }
}

const dir = await directory();
const rows: Row[] = [];
for (let i = 0; i < tickers.length; i += 2) {
  rows.push(...await Promise.all(tickers.slice(i, i + 2).map((t) => probe(t, dir))));
  await sleep(700);
}
const deviation = (r: Row) => r.usdPrice && r.impliedPrice ? Math.abs(r.impliedPrice / r.usdPrice - 1) * 100 : null;
const reason = (r: Row) => !r.verified ? "tokens v2 mismatch" : !r.routes ? r.error ?? "no route" : r.priceImpactPct === null || r.priceImpactPct > maxImpact ? "impact" : (r.liquidityUsd ?? 0) < minLiquidity ? "tvl" : deviation(r) === null || deviation(r)! > maxDeviation ? "price deviation" : null;
const passes = (r: Row) => reason(r) === null;
const fmt = (r: Row) => [r.ticker.padEnd(6), (r.symbol ?? "-").padEnd(8), (r.mint ?? "-").padEnd(44), r.verified ? "v2:ok " : "v2:NO ", r.routes ? "route:ok " : "route:NO ", `impact=${r.priceImpactPct === null ? "-" : r.priceImpactPct.toFixed(3) + "%"}`.padEnd(15), `out=${r.outAmount ?? "-"}`.padEnd(18), `liq=$${r.liquidityUsd === null ? "-" : Math.round(r.liquidityUsd).toLocaleString("en-US")}`.padEnd(16), `px=${r.impliedPrice === null ? "-" : r.impliedPrice.toFixed(2)}/${r.usdPrice === null ? "-" : r.usdPrice.toFixed(2)}`.padEnd(22), passes(r) ? "PASS" : `FAIL (${reason(r)})`].join(" ");
console.log(rows.map(fmt).join("\n"));
const passing = rows.filter(passes);
console.log(`\n${passing.length}/${rows.length} pass (gate: routes, impact <= ${maxImpact}% on ${probeSizeUsdc} USDC, TVL >= $${minLiquidity}, implied price within ${maxDeviation}% of Jupiter usdPrice)`);
console.log("\nissuer-assets.ts pin entries:");
console.log(passing.map((r) => `  ${r.symbol}: "${r.mint}",`).join("\n"));
process.exit(0);
