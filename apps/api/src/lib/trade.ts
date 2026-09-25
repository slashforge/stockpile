import { bagAssets, findBag, resolveAsset, trackerBlocked, type Bag } from "./bags";
import { scaledUiMultiplier } from "./market";
import { bagPosition } from "./positions";
import { inspectTransaction } from "./solana-tx";

import { USDC } from "./constants";
export { USDC };
export const tradeErrorCodes = [
  "NO_WALLET", "UNSUPPORTED_INPUT_MINT", "PROVIDER_NOT_CONFIGURED", "BAG_NOT_TRADABLE", "AMOUNT_TOO_SMALL",
  "NO_ROUTE", "TOKEN_NOT_TRADABLE", "SLIPPAGE_REJECTED", "QUOTE_MISMATCH", "PROVIDER_ERROR", "PROVIDER_TIMEOUT", "INVALID_TRANSACTION", "NO_POSITION",
] as const;
export type TradeErrorCode = (typeof tradeErrorCodes)[number];
export type TradeError = { code: TradeErrorCode; message: string; legIndex: number | null; symbol: string | null };
export type TradeSide = "buy" | "sell";
/** Buy: `inputMint` (USDC) + `amount` (USDC base units). Sell: `portionBps` of the user's bag position; `inputMint`/`amount` ignored. */
export type TradeRequest = { bagId: string; side?: TradeSide; inputMint?: string; amount?: string; portionBps?: number; slippageBps: number };
export type TradeContext = { userId: string; walletAddress: string | null };
export type JupiterQuote = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold?: string; slippageBps?: number; priceImpactPct?: string; routePlan?: unknown[]; [key: string]: unknown };
export type QuoteLeg = { index: number; symbol: string; weightBps: number; inputMint: string; outputMint: string; outputDecimals: number | null; uiAmountMultiplier: number; inputAmount: string; outAmount: string; minOutAmount: string | null; priceImpactPct: string | null; routeSteps: number };
export type PreparedLeg = QuoteLeg & { transaction: string; lastValidBlockHeight: number | null };
type Leg = { index: number; asset: { symbol: string; weightBps: number }; inputMint: string; outputMint: string; outputDecimals: number | null; uiAmountMultiplier: number; amount: bigint };
type Result<T> = { ok: true; value: T } | { ok: false; error: TradeError };

const fail = (code: TradeErrorCode, message: string, leg?: { index: number; symbol: string }): Result<never> => ({ ok: false, error: { code, message, legIndex: leg?.index ?? null, symbol: leg?.symbol ?? null } });
const at = (leg: Leg) => ({ index: leg.index, symbol: leg.asset.symbol });
const jupiterHeaders = () => ({ "x-api-key": process.env.JUPITER_API_KEY!, "Content-Type": "application/json" });
export const tradeSide = (request: TradeRequest): TradeSide => request.side ?? "buy";

/** Deterministic USDC split by weight; the last leg absorbs rounding so the legs sum to the requested amount. */
export async function splitLegs(bag: Bag, amount: bigint): Promise<Result<Leg[]>> {
  const legs: Leg[] = [];
  let allocated = 0n;
  const assets = await bagAssets(bag);
  if (!assets.length || trackerBlocked(bag, assets)) return fail("BAG_NOT_TRADABLE", `${bag.title} is research-only: not enough disclosed tickers overlap tradable assets`);
  for (const [index, asset] of assets.entries()) {
    const resolved = await resolveAsset(bag, asset);
    if (!resolved.mint) return fail("BAG_NOT_TRADABLE", `${asset.symbol} has no verified mint; this bag is research-only`, { index, symbol: asset.symbol });
    const legAmount = index === assets.length - 1 ? amount - allocated : amount * BigInt(asset.weightBps) / 10000n;
    allocated += legAmount;
    legs.push({ index, asset, inputMint: USDC, outputMint: resolved.mint, outputDecimals: resolved.decimals, uiAmountMultiplier: resolved.uiAmountMultiplier, amount: legAmount });
  }
  const tooSmall = legs.find((leg) => leg.amount <= 0n);
  if (tooSmall) return fail("AMOUNT_TOO_SMALL", "Amount is too small to allocate to every leg", at(tooSmall));
  return { ok: true, value: legs };
}

/**
 * Sell legs: for every leg of the user's position in the bag with held > 0, sell floor(held * portionBps / 10000) base units for USDC.
 * `held` is the server-side position (lots reconciled against the wallet); the client never supplies token amounts. All-or-nothing:
 * a leg that would round to zero fails the whole request so the bag's per-leg proportions stay intact.
 */
export async function sellLegs(bag: Bag, context: TradeContext, portionBps: number): Promise<Result<Leg[]>> {
  if (!context.walletAddress) return fail("NO_WALLET", "No verified Solana wallet linked to this Privy identity");
  const { position, status, message } = await bagPosition({ id: context.userId, walletAddress: context.walletAddress }, bag.id);
  if (!position || !position.legs.some((leg) => leg.held !== "0")) return fail("NO_POSITION", status === "unavailable" ? message ?? "Wallet balances are unavailable" : `You hold nothing in ${bag.title}`);
  if (status === "unavailable") return fail("PROVIDER_ERROR", message ?? "Wallet balances are unavailable; try again");
  const assets = await bagAssets(bag);
  const legs: Leg[] = [];
  for (const leg of position.legs.filter((item) => item.held !== "0")) {
    const amount = BigInt(leg.held) * BigInt(portionBps) / 10000n;
    // weightBps echoes the bag's current weight for the symbol (0 when the mint has since left a tracker bag); it is informational for sells.
    const current = assets.find((asset) => asset.symbol === leg.symbol);
    const entry: Leg = { index: legs.length, asset: { symbol: leg.symbol, weightBps: current?.weightBps ?? 0 }, inputMint: leg.mint, outputMint: USDC, outputDecimals: 6, uiAmountMultiplier: await scaledUiMultiplier(leg.mint), amount };
    if (amount <= 0n) return fail("AMOUNT_TOO_SMALL", `${leg.symbol} portion rounds to zero; sell a larger share`, at(entry));
    legs.push(entry);
  }
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
  for (const [key, value] of Object.entries({ inputMint: leg.inputMint, outputMint: leg.outputMint, amount: leg.amount.toString(), slippageBps: String(slippageBps), restrictIntermediateTokens: "true" })) url.searchParams.set(key, value);
  let res: Response;
  try { res = await fetch(url, { headers: jupiterHeaders(), signal: AbortSignal.timeout(8000) }); }
  catch (error) { return fail(error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", `Jupiter quote unavailable for ${leg.asset.symbol}`, at(leg)); }
  if (!res.ok) return providerError(res, leg, "quote rejected");
  const quote = await res.json().catch(() => null) as JupiterQuote | null;
  if (!quote || quote.inputMint !== leg.inputMint || quote.outputMint !== leg.outputMint || quote.inAmount !== leg.amount.toString() || !/^\d+$/.test(quote.outAmount ?? "")) return fail("QUOTE_MISMATCH", `Jupiter quote did not match the requested ${leg.asset.symbol} leg`, at(leg));
  return { ok: true, value: quote };
}

export function toQuoteLeg(leg: Leg, quote: JupiterQuote): QuoteLeg {
  return { index: leg.index, symbol: leg.asset.symbol, weightBps: leg.asset.weightBps, inputMint: leg.inputMint, outputMint: leg.outputMint, outputDecimals: leg.outputDecimals, uiAmountMultiplier: leg.uiAmountMultiplier, inputAmount: quote.inAmount, outAmount: quote.outAmount,
    minOutAmount: typeof quote.otherAmountThreshold === "string" && /^\d+$/.test(quote.otherAmountThreshold) ? quote.otherAmountThreshold : null,
    priceImpactPct: typeof quote.priceImpactPct === "string" ? quote.priceImpactPct : null, routeSteps: Array.isArray(quote.routePlan) ? quote.routePlan.length : 0 };
}

/** Quotes every leg or returns the first typed failure; never a partial success. Sells need the caller's identity for the position. */
export async function quoteBag(request: TradeRequest, context: TradeContext | null = null): Promise<Result<{ legs: Leg[]; quotes: JupiterQuote[] }>> {
  const bag = findBag(request.bagId)!;
  const side = tradeSide(request);
  if (side === "buy" && request.inputMint !== USDC) return fail("UNSUPPORTED_INPUT_MINT", "Only mainnet USDC is supported as an input");
  if (side === "buy" && !(request.amount && /^[1-9][0-9]*$/.test(request.amount))) return fail("AMOUNT_TOO_SMALL", "A buy needs a positive USDC amount in base units");
  if (side === "sell" && !(request.portionBps && Number.isInteger(request.portionBps) && request.portionBps >= 1 && request.portionBps <= 10000)) return fail("AMOUNT_TOO_SMALL", "A sell needs portionBps between 1 and 10000");
  if (side === "sell" && !context) return fail("NO_WALLET", "Sign in to sell a bag position");
  if (!process.env.JUPITER_API_KEY) return fail("PROVIDER_NOT_CONFIGURED", "Jupiter is not configured");
  const split = side === "buy" ? await splitLegs(bag, BigInt(request.amount!)) : await sellLegs(bag, context!, request.portionBps!);
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
export async function prepareBag(request: TradeRequest, walletAddress: string, context: TradeContext | null = null): Promise<Result<PreparedLeg[]>> {
  const quoted = await quoteBag(request, context);
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
