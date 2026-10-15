import { secret } from "./config";
import { bagIdsForMints, catalogueName, knownSymbol } from "./bags";
import { USDC } from "./constants";
import { cachedScaledUiMultiplier, cachedUsdPrice } from "./market";
import { holdings as jupiterHoldings } from "./jupiter";
import { tokenMetadata, WSOL_MINT, type TokenMeta } from "./token-meta";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"; // xStocks are Token-2022 mints.
export type Holding = {
  mint: string; symbol: string | null; name: string | null; iconUrl: string | null; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022";
  usdPrice: number | null; usdValue: number | null; bagIds: string[];
};
export type Balance = { amount: string; decimals: number; uiAmount: string; usdPrice: number | null; usdValue: number | null };
export type Portfolio = { status: "live" | "unavailable"; holdings: Holding[]; sol: Balance | null; usdc: Balance | null; totalUsd: number | null; unpricedCount: number; asOf: string | null; message: string | null };
type TokenAccount = { account: { data: { parsed: { info: { mint: string; state?: string; tokenAmount: { amount: string; decimals: number; uiAmountString?: unknown } } } } } };
type RpcResult<T> = { id: number; result?: T; error?: unknown };
const uiPattern = /^\d+(\.\d+)?$/;

export const unavailablePortfolio = (message: string): Portfolio => ({ status: "unavailable", holdings: [], sol: null, usdc: null, totalUsd: null, unpricedCount: 0, asOf: null, message });
export type RawHolding = { mint: string; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022"; isFrozen?: boolean; excludeFromNetWorth?: boolean };
export type RawHoldings = { ok: true; lamports: number; holdings: RawHolding[] } | { ok: false; message: string };

/** Exact decimal string for an atomic amount (no floating point). */
export function atomicToUi(amount: string | bigint, decimals: number): string {
  const value = BigInt(amount);
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return sign + (fraction ? `${whole}.${fraction}` : whole);
}
function holdingUi(mint: string, amount: string, decimals: number): string {
  const raw = atomicToUi(amount, decimals), multiplier = cachedScaledUiMultiplier(mint);
  return multiplier === 1 ? raw : (Number(raw) * multiplier).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}
/** USD value from a UI amount and a price; null unless both are known (a zero balance is worth 0). Rounded to 6 dp. */
export function usdValueOf(uiAmount: string | null, usdPrice: number | null): number | null {
  if (uiAmount === null || !uiPattern.test(uiAmount)) return null;
  if (Number(uiAmount) === 0) return 0;
  if (usdPrice === null) return null;
  return Math.round(Number(uiAmount) * usdPrice * 1e6) / 1e6;
}
const balance = (amount: bigint, decimals: number, usdPrice: number | null): Balance => {
  const uiAmount = atomicToUi(amount, decimals);
  return { amount: amount.toString(), decimals, uiAmount, usdPrice, usdValue: usdValueOf(uiAmount, usdPrice) };
};
/**
 * USD price for a mint: Jupiter Tokens v2, else the cached Price v3 market snapshot (bag mints), else USDC at its $1 peg
 * (USDC is the app's unit of account; without this a Jupiter rate-limit blip would show a USDC-only wallet as worthless).
 */
const priceOf = (mint: string, meta: Map<string, TokenMeta>) => meta.get(mint)?.usdPrice ?? cachedUsdPrice(mint) ?? (mint === USDC ? 1 : null);
/** Sum of priced values; null when nothing non-zero is priced but something is unpriced (unknown, not $0). */
export function portfolioTotal(values: (number | null)[]): number | null {
  const unpriced = values.some((value) => value === null);
  const priced = values.filter((value): value is number => value !== null);
  if (unpriced && !priced.some((value) => value > 0)) return null;
  return Math.round(priced.reduce((sum, value) => sum + value, 0) * 1e6) / 1e6;
}

/** Jupiter Swap v2 holdings first, with the Helius balance batch as a provider fallback. */
export async function readRawHoldings(walletAddress: string): Promise<RawHoldings> {
  if (secret("JupiterApiKey")) {
    try {
      const raw = await jupiterHoldings(walletAddress);
      const lamports = Number(raw.amount);
      if (typeof raw.amount !== "string" || !/^\d+$/.test(raw.amount) || !Number.isSafeInteger(lamports) || lamports < 0 || !raw.tokens || typeof raw.tokens !== "object" || Array.isArray(raw.tokens)) throw new Error("Invalid holdings");
      const holdings: RawHolding[] = [];
      for (const [mint, accounts] of Object.entries(raw.tokens)) {
        if (!Array.isArray(accounts)) throw new Error("Invalid token accounts");
        for (const account of accounts) {
          if (typeof account.amount !== "string" || !/^\d+$/.test(account.amount) || !Number.isInteger(account.decimals) || account.decimals < 0 || account.decimals > 18) throw new Error("Invalid token balance");
          if (BigInt(account.amount) === 0n) continue;
          if (account.programId !== TOKEN_PROGRAM && account.programId !== TOKEN_2022_PROGRAM) throw new Error("Invalid token program");
          holdings.push({ mint, amount: account.amount, decimals: account.decimals, uiAmount: holdingUi(mint, account.amount, account.decimals),
            program: account.programId === TOKEN_PROGRAM ? "token" : "token-2022", ...(account.isFrozen ? { isFrozen: true } : {}), ...(account.excludeFromNetWorth ? { excludeFromNetWorth: true } : {}) });
        }
      }
      return { ok: true, lamports, holdings };
    } catch { /* Helius can still serve balances when Jupiter is unavailable. */ }
  }
  const key = secret("HeliusApiKey");
  if (!key) return { ok: false, message: secret("JupiterApiKey") ? "Holdings provider unavailable" : "Holdings providers are not configured" };
  try {
    const owner = (id: number, programId: string) => ({ jsonrpc: "2.0", id, method: "getTokenAccountsByOwner", params: [walletAddress, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }] });
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "getBalance", params: [walletAddress, { commitment: "confirmed" }] }, owner(2, TOKEN_PROGRAM), owner(3, TOKEN_2022_PROGRAM)]), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, message: "Holdings provider unavailable" };
    const results = await res.json() as RpcResult<unknown>[];
    if (!Array.isArray(results) || results.length !== 3 || results.some((item) => item.error || item.result === undefined)) return { ok: false, message: "Holdings provider unavailable" };
    const byId = new Map(results.map((item) => [item.id, item.result]));
    const lamports = (byId.get(1) as { value?: unknown })?.value;
    if (typeof lamports !== "number" || !Number.isSafeInteger(lamports) || lamports < 0) return { ok: false, message: "Holdings provider unavailable" };
    const accounts = (program: "token" | "token-2022") => (((byId.get(program === "token" ? 2 : 3) as { value?: TokenAccount[] })?.value) ?? [])
      .map(({ account }) => { const info = account.data.parsed.info; return { mint: info.mint, amount: info.tokenAmount.amount, decimals: info.tokenAmount.decimals, uiAmount: holdingUi(info.mint, info.tokenAmount.amount, info.tokenAmount.decimals), program, ...(info.state === "frozen" ? { isFrozen: true } : {}) }; });
    return { ok: true, lamports, holdings: [...accounts("token"), ...accounts("token-2022")].filter((item) => /^\d+$/.test(item.amount) && item.amount !== "0") };
  } catch { return { ok: false, message: "Holdings provider unavailable" }; }
}

/**
 * Reads SOL, USDC, and SPL / Token-2022 holdings from Jupiter (Helius fallback), then enriches each mint with
 * Jupiter Tokens v2 metadata and USD price. Never fabricates balances or prices: any RPC failure is explicitly
 * unavailable, and unknown / unpriced tokens carry nulls (counted in `unpricedCount`).
 */
export async function readPortfolio(walletAddress: string): Promise<Portfolio> {
  const raw = await readRawHoldings(walletAddress);
  if (!raw.ok) return unavailablePortfolio(raw.message);

  // Jupiter enrichment is best-effort: a metadata failure never hides verified balances. Bag membership loads in parallel.
  const mints = raw.holdings.map((item) => item.mint);
  const [meta, bagIds] = await Promise.all([
    tokenMetadata([WSOL_MINT, USDC, ...mints]).catch(() => new Map<string, TokenMeta>()),
    bagIdsForMints(mints).catch(() => new Map<string, string[]>()),
  ]);
  const holdings: Holding[] = raw.holdings.map((item) => {
    const { isFrozen, excludeFromNetWorth, ...holding } = item;
    const token = meta.get(item.mint);
    const configured = item.mint === USDC ? "USDC" : knownSymbol(item.mint);
    const usdPrice = priceOf(item.mint, meta);
    return { ...holding, symbol: configured ?? token?.symbol ?? null, name: (configured && catalogueName(configured)) ?? token?.name ?? (item.mint === USDC ? "USD Coin" : null), iconUrl: token?.iconUrl ?? null,
      usdPrice, usdValue: usdValueOf(item.uiAmount, usdPrice), bagIds: bagIds.get(item.mint) ?? [] };
  });
  const sol = balance(BigInt(raw.lamports), 9, priceOf(WSOL_MINT, meta));
  const usdc = balance(raw.holdings.filter((item) => item.mint === USDC && item.decimals === 6).reduce((sum, item) => sum + BigInt(item.amount), 0n), 6, priceOf(USDC, meta));
  const values = [...holdings.filter((_, index) => !raw.holdings[index]?.excludeFromNetWorth).map((item) => item.usdValue), sol.usdValue];
  return { status: "live", holdings, sol, usdc, totalUsd: portfolioTotal(values), unpricedCount: values.filter((value) => value === null).length, asOf: new Date().toISOString(), message: null };
}
