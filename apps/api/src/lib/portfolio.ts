import { bagIdsForMint, catalogueName, knownSymbol } from "./bags";
import { USDC } from "./constants";
import { tokenMetadata, WSOL_MINT, type TokenMeta } from "./token-meta";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"; // xStocks are Token-2022 mints.
export type Holding = {
  mint: string; symbol: string | null; name: string | null; iconUrl: string | null; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022";
  usdPrice: number | null; usdValue: number | null; bagIds: string[];
};
export type Balance = { amount: string; decimals: number; uiAmount: string; usdPrice: number | null; usdValue: number | null };
export type Portfolio = { status: "live" | "unavailable"; holdings: Holding[]; sol: Balance | null; usdc: Balance | null; totalUsd: number | null; unpricedCount: number; asOf: string | null; message: string | null };
type TokenAccount = { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString?: unknown } } } } } };
type RpcResult<T> = { id: number; result?: T; error?: unknown };
const uiPattern = /^\d+(\.\d+)?$/;

export const unavailablePortfolio = (message: string): Portfolio => ({ status: "unavailable", holdings: [], sol: null, usdc: null, totalUsd: null, unpricedCount: 0, asOf: null, message });
export type RawHolding = { mint: string; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022" };
export type RawHoldings = { ok: true; lamports: number; holdings: RawHolding[] } | { ok: false; message: string };

/** Exact decimal string for an atomic amount (no floating point). */
export function atomicToUi(amount: string | bigint, decimals: number): string {
  const digits = BigInt(amount).toString().padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return fraction ? `${whole}.${fraction}` : whole;
}
/** USD value from a UI amount and a price; null unless both are known (a zero balance is worth 0). Rounded to 6 dp. */
export function usdValueOf(uiAmount: string | null, usdPrice: number | null): number | null {
  if (uiAmount === null || !uiPattern.test(uiAmount)) return null;
  if (Number(uiAmount) === 0) return 0;
  if (usdPrice === null) return null;
  return Math.round(Number(uiAmount) * usdPrice * 1e6) / 1e6;
}
const balance = (amount: bigint, decimals: number, meta: TokenMeta | undefined): Balance => {
  const uiAmount = atomicToUi(amount, decimals);
  return { amount: amount.toString(), decimals, uiAmount, usdPrice: meta?.usdPrice ?? null, usdValue: usdValueOf(uiAmount, meta?.usdPrice ?? null) };
};

/** One batched Helius RPC call: SOL balance plus every SPL / Token-2022 token account of the wallet (balance source of truth). */
export async function readRawHoldings(walletAddress: string): Promise<RawHoldings> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return { ok: false, message: "Helius is not configured" };
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
      .map(({ account }) => { const info = account.data.parsed.info; const ui = info.tokenAmount.uiAmountString; return { mint: info.mint, amount: info.tokenAmount.amount, decimals: info.tokenAmount.decimals, uiAmount: typeof ui === "string" && uiPattern.test(ui) ? ui : null, program }; });
    return { ok: true, lamports, holdings: [...accounts("token"), ...accounts("token-2022")].filter((item) => /^\d+$/.test(item.amount) && item.amount !== "0") };
  } catch { return { ok: false, message: "Holdings provider unavailable" }; }
}

/**
 * Reads SOL, USDC, and SPL / Token-2022 holdings from Helius RPC (balance source of truth), then enriches each mint with
 * Jupiter Tokens v2 metadata and USD price. Never fabricates balances or prices: any RPC failure is explicitly
 * unavailable, and unknown / unpriced tokens carry nulls (counted in `unpricedCount`).
 */
export async function readPortfolio(walletAddress: string): Promise<Portfolio> {
  const raw = await readRawHoldings(walletAddress);
  if (!raw.ok) return unavailablePortfolio(raw.message);

  // Jupiter enrichment is best-effort: a metadata failure never hides verified balances.
  const meta = await tokenMetadata([WSOL_MINT, USDC, ...raw.holdings.map((item) => item.mint)]).catch(() => new Map<string, TokenMeta>());
  const holdings: Holding[] = await Promise.all(raw.holdings.map(async (item) => {
    const token = meta.get(item.mint);
    const configured = item.mint === USDC ? "USDC" : knownSymbol(item.mint);
    const usdPrice = token?.usdPrice ?? null;
    return { ...item, symbol: configured ?? token?.symbol ?? null, name: (configured && catalogueName(configured)) ?? token?.name ?? (item.mint === USDC ? "USD Coin" : null), iconUrl: token?.iconUrl ?? null,
      usdPrice, usdValue: usdValueOf(item.uiAmount, usdPrice), bagIds: await bagIdsForMint(item.mint) };
  }));
  const sol = balance(BigInt(raw.lamports), 9, meta.get(WSOL_MINT));
  const usdc = balance(raw.holdings.filter((item) => item.mint === USDC && item.decimals === 6).reduce((sum, item) => sum + BigInt(item.amount), 0n), 6, meta.get(USDC));
  const priced = [...holdings.map((item) => item.usdValue), sol.usdValue];
  return { status: "live", holdings, sol, usdc, totalUsd: Math.round(priced.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 1e6) / 1e6, unpricedCount: priced.filter((value) => value === null).length, asOf: new Date().toISOString(), message: null };
}
