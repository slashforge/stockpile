import { configuredSymbol } from "./bags";
import { USDC } from "./constants";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"; // xStocks are Token-2022 mints.
export type Holding = { mint: string; symbol: string | null; amount: string; decimals: number; uiAmount: string | null; program: "token" | "token-2022" };
export type Balance = { amount: string; decimals: number };
export type Portfolio = { status: "live" | "unavailable"; holdings: Holding[]; sol: Balance | null; usdc: Balance | null; asOf: string | null; message: string | null };
type TokenAccount = { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number; uiAmountString?: unknown } } } } } };
type RpcResult<T> = { id: number; result?: T; error?: unknown };

export const unavailablePortfolio = (message: string): Portfolio => ({ status: "unavailable", holdings: [], sol: null, usdc: null, asOf: null, message });

/** Reads SOL, USDC, and SPL / Token-2022 holdings from Helius RPC. Never fabricates balances: any failure is explicitly unavailable. */
export async function readPortfolio(walletAddress: string): Promise<Portfolio> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return unavailablePortfolio("Helius is not configured");
  try {
    const owner = (id: number, programId: string) => ({ jsonrpc: "2.0", id, method: "getTokenAccountsByOwner", params: [walletAddress, { programId }, { encoding: "jsonParsed", commitment: "confirmed" }] });
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "getBalance", params: [walletAddress, { commitment: "confirmed" }] }, owner(2, TOKEN_PROGRAM), owner(3, TOKEN_2022_PROGRAM)]), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return unavailablePortfolio("Holdings provider unavailable");
    const results = await res.json() as RpcResult<unknown>[];
    if (!Array.isArray(results) || results.length !== 3 || results.some((item) => item.error || item.result === undefined)) return unavailablePortfolio("Holdings provider unavailable");
    const byId = new Map(results.map((item) => [item.id, item.result]));
    const lamports = (byId.get(1) as { value?: unknown })?.value;
    if (typeof lamports !== "number" || !Number.isSafeInteger(lamports) || lamports < 0) return unavailablePortfolio("Holdings provider unavailable");
    const accounts = (program: "token" | "token-2022") => (((byId.get(program === "token" ? 2 : 3) as { value?: TokenAccount[] })?.value) ?? [])
      .map(({ account }) => ({ mint: account.data.parsed.info.mint, symbol: account.data.parsed.info.mint === USDC ? "USDC" : configuredSymbol(account.data.parsed.info.mint), amount: account.data.parsed.info.tokenAmount.amount, decimals: account.data.parsed.info.tokenAmount.decimals, uiAmount: typeof account.data.parsed.info.tokenAmount.uiAmountString === "string" && /^\d+(\.\d+)?$/.test(account.data.parsed.info.tokenAmount.uiAmountString) ? account.data.parsed.info.tokenAmount.uiAmountString : null, program }));
    const holdings = [...accounts("token"), ...accounts("token-2022")].filter((item) => /^\d+$/.test(item.amount) && item.amount !== "0");
    const usdcAccounts = holdings.filter((item) => item.mint === USDC && item.decimals === 6);
    const usdc = usdcAccounts.reduce((sum, item) => sum + BigInt(item.amount), 0n);
    return { status: "live", holdings, sol: { amount: String(lamports), decimals: 9 }, usdc: { amount: usdc.toString(), decimals: 6 }, asOf: new Date().toISOString(), message: null };
  } catch { return unavailablePortfolio("Holdings provider unavailable"); }
}
