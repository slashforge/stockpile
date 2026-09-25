import { findBag, resolveAsset, type Bag } from "./bags";
import { inspectTransaction } from "./solana-tx";

import { USDC } from "./constants";
export { USDC };
export const tradeErrorCodes = [
  "NO_WALLET", "UNSUPPORTED_INPUT_MINT", "PROVIDER_NOT_CONFIGURED", "BAG_NOT_TRADABLE", "AMOUNT_TOO_SMALL",
  "NO_ROUTE", "TOKEN_NOT_TRADABLE", "SLIPPAGE_REJECTED", "QUOTE_MISMATCH", "PROVIDER_ERROR", "PROVIDER_TIMEOUT", "INVALID_TRANSACTION",
] as const;
export type TradeErrorCode = (typeof tradeErrorCodes)[number];
export type TradeError = { code: TradeErrorCode; message: string; legIndex: number | null; symbol: string | null };
export type TradeRequest = { bagId: string; inputMint: string; amount: string; slippageBps: number };
export type JupiterQuote = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold?: string; slippageBps?: number; priceImpactPct?: string; routePlan?: unknown[]; [key: string]: unknown };
export type QuoteLeg = { index: number; symbol: string; weightBps: number; inputMint: string; outputMint: string; outputDecimals: number | null; uiAmountMultiplier: number; inputAmount: string; outAmount: string; minOutAmount: string | null; priceImpactPct: string | null; routeSteps: number };
export type PreparedLeg = QuoteLeg & { transaction: string; lastValidBlockHeight: number | null };
type Leg = { index: number; asset: Bag["assets"][number]; mint: string; decimals: number | null; uiAmountMultiplier: number; amount: bigint };
type Result<T> = { ok: true; value: T } | { ok: false; error: TradeError };

const fail = (code: TradeErrorCode, message: string, leg?: { index: number; symbol: string }): Result<never> => ({ ok: false, error: { code, message, legIndex: leg?.index ?? null, symbol: leg?.symbol ?? null } });
const at = (leg: Leg) => ({ index: leg.index, symbol: leg.asset.symbol });
const jupiterHeaders = () => ({ "x-api-key": process.env.JUPITER_API_KEY!, "Content-Type": "application/json" });

/** Deterministic USDC split by weight; the last leg absorbs rounding so the legs sum to the requested amount. */
export async function splitLegs(bag: Bag, amount: bigint): Promise<Result<Leg[]>> {
  const legs: Leg[] = [];
  let allocated = 0n;
  for (const [index, asset] of bag.assets.entries()) {
    const resolved = await resolveAsset(bag, asset);
    if (!resolved.mint) return fail("BAG_NOT_TRADABLE", `${asset.symbol} has no verified mint; this bag is research-only`, { index, symbol: asset.symbol });
    const legAmount = index === bag.assets.length - 1 ? amount - allocated : amount * BigInt(asset.weightBps) / 10000n;
    allocated += legAmount;
    legs.push({ index, asset, mint: resolved.mint, decimals: resolved.decimals, uiAmountMultiplier: resolved.uiAmountMultiplier, amount: legAmount });
  }
  const tooSmall = legs.find((leg) => leg.amount <= 0n);
  if (tooSmall) return fail("AMOUNT_TOO_SMALL", "Amount is too small to allocate to every leg", at(tooSmall));
  return { ok: true, value: legs };
}

async function providerError(res: Response, leg: Leg, fallback: string): Promise<Result<never>> {
  const body = await res.json().catch(() => null) as { error?: string; errorCode?: string } | null;
  const code = body?.errorCode ?? "";
  const message = body?.error && body.error.length < 200 ? body.error : fallback;
  if (code === "NO_ROUTES_FOUND" || code === "COULD_NOT_FIND_ANY_ROUTE") return fail("NO_ROUTE", `No route for ${leg.asset.symbol}: ${message}`, at(leg));
  if (code === "TOKEN_NOT_TRADABLE") return fail("TOKEN_NOT_TRADABLE", `${leg.asset.symbol} is not tradable on Jupiter right now`, at(leg));
  if (/slippage/i.test(code) || /slippage/i.test(message)) return fail("SLIPPAGE_REJECTED", message, at(leg));
  return fail("PROVIDER_ERROR", `Jupiter ${res.status} for ${leg.asset.symbol}: ${message}`, at(leg));
}

async function quoteLeg(leg: Leg, slippageBps: number): Promise<Result<JupiterQuote>> {
  const url = new URL("https://api.jup.ag/swap/v1/quote");
  for (const [key, value] of Object.entries({ inputMint: USDC, outputMint: leg.mint, amount: leg.amount.toString(), slippageBps: String(slippageBps), restrictIntermediateTokens: "true" })) url.searchParams.set(key, value);
  let res: Response;
  try { res = await fetch(url, { headers: jupiterHeaders(), signal: AbortSignal.timeout(8000) }); }
  catch (error) { return fail(error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", `Jupiter quote unavailable for ${leg.asset.symbol}`, at(leg)); }
  if (!res.ok) return providerError(res, leg, "quote rejected");
  const quote = await res.json().catch(() => null) as JupiterQuote | null;
  if (!quote || quote.inputMint !== USDC || quote.outputMint !== leg.mint || quote.inAmount !== leg.amount.toString() || !/^\d+$/.test(quote.outAmount ?? "")) return fail("QUOTE_MISMATCH", `Jupiter quote did not match the requested ${leg.asset.symbol} leg`, at(leg));
  return { ok: true, value: quote };
}

export function toQuoteLeg(leg: Leg, quote: JupiterQuote): QuoteLeg {
  return { index: leg.index, symbol: leg.asset.symbol, weightBps: leg.asset.weightBps, inputMint: USDC, outputMint: leg.mint, outputDecimals: leg.decimals, uiAmountMultiplier: leg.uiAmountMultiplier, inputAmount: quote.inAmount, outAmount: quote.outAmount,
    minOutAmount: typeof quote.otherAmountThreshold === "string" && /^\d+$/.test(quote.otherAmountThreshold) ? quote.otherAmountThreshold : null,
    priceImpactPct: typeof quote.priceImpactPct === "string" ? quote.priceImpactPct : null, routeSteps: Array.isArray(quote.routePlan) ? quote.routePlan.length : 0 };
}

/** Quotes every leg or returns the first typed failure; never a partial success. */
export async function quoteBag(request: TradeRequest): Promise<Result<{ legs: Leg[]; quotes: JupiterQuote[] }>> {
  const bag = findBag(request.bagId)!;
  if (request.inputMint !== USDC) return fail("UNSUPPORTED_INPUT_MINT", "Only mainnet USDC is supported as an input");
  if (!process.env.JUPITER_API_KEY) return fail("PROVIDER_NOT_CONFIGURED", "Jupiter is not configured");
  const split = await splitLegs(bag, BigInt(request.amount));
  if (!split.ok) return split;
  const quotes: JupiterQuote[] = [];
  for (const leg of split.value) {
    const quoted = await quoteLeg(leg, request.slippageBps);
    if (!quoted.ok) return quoted;
    quotes.push(quoted.value);
  }
  return { ok: true, value: { legs: split.value, quotes } };
}

/** Builds one unsigned swap transaction per leg with the user's wallet as fee payer; all-or-nothing. */
export async function prepareBag(request: TradeRequest, walletAddress: string): Promise<Result<PreparedLeg[]>> {
  const quoted = await quoteBag(request);
  if (!quoted.ok) return quoted;
  const prepared: PreparedLeg[] = [];
  for (const [i, leg] of quoted.value.legs.entries()) {
    const quoteResponse = quoted.value.quotes[i]!;
    let res: Response;
    try { res = await fetch("https://api.jup.ag/swap/v1/swap", { method: "POST", headers: jupiterHeaders(), body: JSON.stringify({ quoteResponse, userPublicKey: walletAddress, dynamicComputeUnitLimit: true, dynamicSlippage: false }), signal: AbortSignal.timeout(8000) }); }
    catch (error) { return fail(error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", `Jupiter could not prepare the ${leg.asset.symbol} leg`, at(leg)); }
    if (!res.ok) return providerError(res, leg, "swap build rejected");
    const data = await res.json().catch(() => null) as { swapTransaction?: unknown; lastValidBlockHeight?: unknown } | null;
    const transaction = typeof data?.swapTransaction === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(data.swapTransaction) ? data.swapTransaction : null;
    if (!transaction) return fail("INVALID_TRANSACTION", `Jupiter returned an invalid transaction for ${leg.asset.symbol}`, at(leg));
    try {
      const summary = inspectTransaction(transaction);
      if (summary.signed || summary.feePayer !== walletAddress) return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction is not an unsigned transaction paid by your wallet`, at(leg));
    } catch { return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction could not be inspected`, at(leg)); }
    prepared.push({ ...toQuoteLeg(leg, quoteResponse), transaction, lastValidBlockHeight: typeof data?.lastValidBlockHeight === "number" ? data.lastValidBlockHeight : null });
  }
  return { ok: true, value: prepared };
}
