import { secret } from "./config";
import { bagAssets, findBag, knownSymbol, resolveAsset, trackerBlocked, type Bag } from "./bags";
import { scaledUiMultiplier } from "./market";
import { bagPosition, looseBalances } from "./positions";
import { inspectTransaction } from "./solana-tx";
import { type BuildResponse, compileSponsored, paymaster, rpcUrl } from "./sponsor";
import { tokenMetadata } from "./token-meta";

import { USDC } from "./constants";
export { USDC };
export const tradeErrorCodes = [
  "NO_WALLET", "UNSUPPORTED_INPUT_MINT", "PROVIDER_NOT_CONFIGURED", "BAG_NOT_TRADABLE", "AMOUNT_TOO_SMALL",
  "NO_ROUTE", "TOKEN_NOT_TRADABLE", "SLIPPAGE_REJECTED", "QUOTE_MISMATCH", "PROVIDER_ERROR", "PROVIDER_TIMEOUT", "INVALID_TRANSACTION", "NO_POSITION",
] as const;
export type TradeErrorCode = (typeof tradeErrorCodes)[number];
export type TradeError = { code: TradeErrorCode; message: string; legIndex: number | null; symbol: string | null };
export type TradeSide = "buy" | "sell";
/**
 * Buy: `inputMint` (USDC) + `amount` (USDC base units). Sell: `portionBps` of the user's bag position; `inputMint`/`amount` ignored.
 * `slippageBps` is an advanced override; when absent Jupiter's real-time slippage estimator (RTSE) picks the limit per leg.
 */
export type TradeRequest = { bagId: string; side?: TradeSide; inputMint?: string; amount?: string; portionBps?: number; slippageBps?: number | null };
/** Direct sell of tokens held outside every bag position: `portionBps` of each mint's loose balance, swapped to USDC. */
export type TokenSellRequest = { mints: string[]; portionBps: number; slippageBps?: number | null };
export type TradeContext = { userId: string; walletAddress: string | null };
export type JupiterQuote = { inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold?: string; slippageBps?: number; priceImpactPct?: string; routePlan?: unknown[]; [key: string]: unknown };
export type QuoteLeg = { index: number; symbol: string; weightBps: number; inputMint: string; outputMint: string; outputDecimals: number | null; uiAmountMultiplier: number; inputAmount: string; outAmount: string; minOutAmount: string | null; priceImpactPct: string | null; routeSteps: number };
export type PreparedLeg = QuoteLeg & { transaction: string; lastValidBlockHeight: number | null; slippageBps: number | null; feePayer: string };
type Leg = { index: number; asset: { symbol: string; weightBps: number }; inputMint: string; outputMint: string; outputDecimals: number | null; uiAmountMultiplier: number; amount: bigint };
type Result<T> = { ok: true; value: T } | { ok: false; error: TradeError };

const fail = (code: TradeErrorCode, message: string, leg?: { index: number; symbol: string }): Result<never> => ({ ok: false, error: { code, message, legIndex: leg?.index ?? null, symbol: leg?.symbol ?? null } });
const at = (leg: Leg) => ({ index: leg.index, symbol: leg.asset.symbol });
const jupiterHeaders = () => ({ "x-api-key": secret("JupiterApiKey") ?? "", "Content-Type": "application/json" });
export const tradeSide = (request: TradeRequest): TradeSide => request.side ?? "buy";
/** Slippage used for indicative quotes when the user leaves protection on automatic. */
const INDICATIVE_SLIPPAGE_BPS = 50;

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

/** Validates the request and sizes every leg; shared by quote and prepare. */
async function tradeLegs(request: TradeRequest, context: TradeContext | null): Promise<Result<Leg[]>> {
  const bag = findBag(request.bagId)!;
  const side = tradeSide(request);
  if (side === "buy" && request.inputMint !== USDC) return fail("UNSUPPORTED_INPUT_MINT", "Only mainnet USDC is supported as an input");
  if (side === "buy" && !(request.amount && /^[1-9][0-9]*$/.test(request.amount))) return fail("AMOUNT_TOO_SMALL", "A buy needs a positive USDC amount in base units");
  if (side === "sell" && !(request.portionBps && Number.isInteger(request.portionBps) && request.portionBps >= 1 && request.portionBps <= 10000)) return fail("AMOUNT_TOO_SMALL", "A sell needs portionBps between 1 and 10000");
  if (side === "sell" && !context) return fail("NO_WALLET", "Sign in to sell a bag position");
  if (!secret("JupiterApiKey")) return fail("PROVIDER_NOT_CONFIGURED", "Jupiter is not configured");
  return side === "buy" ? splitLegs(bag, BigInt(request.amount!)) : sellLegs(bag, context!, request.portionBps!);
}

/** Quotes every leg or returns the first typed failure; never a partial success. Sells need the caller's identity for the position. */
export async function quoteBag(request: TradeRequest, context: TradeContext | null = null): Promise<Result<{ legs: Leg[]; quotes: JupiterQuote[] }>> {
  const split = await tradeLegs(request, context);
  if (!split.ok) return split;
  return quoteLegs(split.value, request.slippageBps ?? null);
}

async function quoteLegs(legs: Leg[], slippageBps: number | null): Promise<Result<{ legs: Leg[]; quotes: JupiterQuote[] }>> {
  const auto = slippageBps == null;
  const quotes: JupiterQuote[] = [];
  for (const leg of legs) {
    const quoted = await quoteLeg(leg, slippageBps ?? INDICATIVE_SLIPPAGE_BPS);
    if (!quoted.ok) return quoted;
    // With automatic protection the real minimum is only known once the swap is built.
    quotes.push(auto ? { ...quoted.value, otherAmountThreshold: undefined } : quoted.value);
  }
  return { ok: true, value: { legs, quotes } };
}

/**
 * Token sell legs: one token -> USDC leg per requested mint, sized from what the wallet holds outside every bag position
 * (`looseBalances`), so a direct sell can never eat into a bag. All-or-nothing like bag trades.
 */
export async function tokenSellLegs(request: TokenSellRequest, context: TradeContext): Promise<Result<Leg[]>> {
  if (!context.walletAddress) return fail("NO_WALLET", "No verified Solana wallet linked to this Privy identity");
  if (!(Number.isInteger(request.portionBps) && request.portionBps >= 1 && request.portionBps <= 10000)) return fail("AMOUNT_TOO_SMALL", "A sell needs portionBps between 1 and 10000");
  const mints = [...new Set(request.mints)];
  if (!mints.length) return fail("NO_POSITION", "Pick at least one token to sell");
  if (mints.includes(USDC)) return fail("UNSUPPORTED_INPUT_MINT", "USDC is what you sell into, so it can't be sold here");
  if (!secret("JupiterApiKey")) return fail("PROVIDER_NOT_CONFIGURED", "Jupiter is not configured");
  const loose = await looseBalances({ id: context.userId, walletAddress: context.walletAddress });
  if (!loose.ok) return fail("PROVIDER_ERROR", `${loose.message}; try again`);
  const meta = await tokenMetadata(mints).catch(() => new Map<string, { symbol: string | null }>());
  const legs: Leg[] = [];
  for (const mint of mints) {
    const symbol = knownSymbol(mint) ?? meta.get(mint)?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    const held = loose.balances.get(mint)?.amount ?? 0n;
    const entry: Leg = { index: legs.length, asset: { symbol, weightBps: 0 }, inputMint: mint, outputMint: USDC, outputDecimals: 6, uiAmountMultiplier: await scaledUiMultiplier(mint), amount: held * BigInt(request.portionBps) / 10000n };
    if (held === 0n) return fail("NO_POSITION", `You hold no ${symbol} outside your bags`, at(entry));
    if (entry.amount <= 0n) return fail("AMOUNT_TOO_SMALL", `${symbol} portion rounds to zero; sell a larger share`, at(entry));
    legs.push(entry);
  }
  return { ok: true, value: legs };
}

export async function quoteTokenSell(request: TokenSellRequest, context: TradeContext): Promise<Result<{ legs: Leg[]; quotes: JupiterQuote[] }>> {
  const split = await tokenSellLegs(request, context);
  if (!split.ok) return split;
  return quoteLegs(split.value, request.slippageBps ?? null);
}

export async function prepareTokenSell(request: TokenSellRequest, walletAddress: string, context: TradeContext): Promise<Result<PreparedLeg[]>> {
  const split = await tokenSellLegs(request, context);
  if (!split.ok) return split;
  return prepareLegs(split.value, walletAddress, request.slippageBps ?? null);
}

async function buildLeg(leg: Leg, walletAddress: string, payer: string, slippageBps: number | null): Promise<Result<BuildResponse>> {
  const url = new URL("https://api.jup.ag/swap/v2/build");
  for (const [key, value] of Object.entries({ inputMint: leg.inputMint, outputMint: leg.outputMint, amount: leg.amount.toString(), taker: walletAddress, payer, slippageBps: slippageBps == null ? "rtse" : String(slippageBps), wrapAndUnwrapSol: "false" })) url.searchParams.set(key, value);
  let res: Response;
  try { res = await fetch(url, { headers: jupiterHeaders(), signal: AbortSignal.timeout(8000) }); }
  catch (error) { return fail(error instanceof Error && error.name === "TimeoutError" ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR", `Jupiter could not prepare the ${leg.asset.symbol} leg`, at(leg)); }
  if (!res.ok) return providerError(res, leg, "swap build rejected");
  const build = await res.json().catch(() => null) as BuildResponse | null;
  if (!build || build.inputMint !== leg.inputMint || build.outputMint !== leg.outputMint || build.inAmount !== leg.amount.toString() || !/^\d+$/.test(build.outAmount ?? "")) return fail("QUOTE_MISMATCH", `Jupiter build did not match the requested ${leg.asset.symbol} leg`, at(leg));
  return { ok: true, value: build };
}

/**
 * Builds one swap transaction per leg, paid (network fee + token-account rent) by the Stockpile paymaster and pre-signed by it.
 * The user's wallet only signs the swap. All-or-nothing.
 */
export async function prepareBag(request: TradeRequest, walletAddress: string, context: TradeContext | null = null): Promise<Result<PreparedLeg[]>> {
  const split = await tradeLegs(request, context);
  if (!split.ok) return split;
  return prepareLegs(split.value, walletAddress, request.slippageBps ?? null);
}

async function prepareLegs(legs: Leg[], walletAddress: string, slippageBps: number | null): Promise<Result<PreparedLeg[]>> {
  const payer = paymaster();
  const url = rpcUrl();
  if (!payer || !url) return fail("PROVIDER_NOT_CONFIGURED", "Sponsored network fees are not configured on this server");
  const payerKey = payer.publicKey.toBase58();
  const prepared: PreparedLeg[] = [];
  for (const leg of legs) {
    const built = await buildLeg(leg, walletAddress, payerKey, slippageBps);
    if (!built.ok) return built;
    const build = built.value;
    let sponsored: Awaited<ReturnType<typeof compileSponsored>>;
    try { sponsored = await compileSponsored(build, walletAddress, payer, url); }
    catch { return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction could not be built`, at(leg)); }
    if (!sponsored.ok) {
      if (sponsored.reason === "slippage") return fail("SLIPPAGE_REJECTED", `${leg.asset.symbol}: ${sponsored.message}`, at(leg));
      if (sponsored.reason === "rpc") return fail("PROVIDER_ERROR", `Couldn't prepare ${leg.asset.symbol}: ${sponsored.message}`, at(leg));
      if (sponsored.reason === "simulation") return fail("PROVIDER_ERROR", `${leg.asset.symbol} swap would fail: ${sponsored.message}`, at(leg));
      return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction was refused: ${sponsored.message}`, at(leg));
    }
    try {
      const summary = inspectTransaction(sponsored.transaction);
      if (summary.feePayer !== payerKey || summary.feePayer === walletAddress) return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction is not sponsored`, at(leg));
    } catch { return fail("INVALID_TRANSACTION", `Prepared ${leg.asset.symbol} transaction could not be inspected`, at(leg)); }
    prepared.push({ ...toQuoteLeg(leg, build as JupiterQuote), transaction: sponsored.transaction, lastValidBlockHeight: sponsored.lastValidBlockHeight, slippageBps: typeof build.slippageBps === "number" ? build.slippageBps : null, feePayer: payerKey });
  }
  return { ok: true, value: prepared };
}
