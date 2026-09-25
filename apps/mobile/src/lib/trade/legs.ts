import { USDC_MINT } from "@/lib/solana/transaction";
import type { Bag, QuoteLeg, TradeError } from "@/services/api/types";

/**
 * Checks the server-supplied label of a prepared leg against what the user asked for, so a
 * transaction can never be presented as a swap into a token outside this bag or from a different
 * input. Returns blocking problems (empty when consistent).
 */
export function legLabelProblems(
  leg: QuoteLeg,
  bag: Pick<Bag, "assets">,
  index: number,
  total: number,
  side: TradeSide = "buy",
): string[] {
  const problems: string[] = [];
  const asset = bag.assets.find((candidate) => candidate.mint === legAssetMint(leg, side));
  if (!asset) {
    problems.push(
      side === "sell"
        ? "This transaction sells a token that isn’t in this bag."
        : "This transaction buys a token that isn’t in this bag.",
    );
  } else if (asset.symbol !== leg.symbol) problems.push("The token label doesn’t match this bag.");
  if (side === "sell") {
    if (leg.outputMint !== USDC_MINT) problems.push("This transaction doesn’t pay out USDC.");
  } else if (leg.inputMint !== USDC_MINT) problems.push("This transaction doesn’t spend USDC.");
  if (leg.index !== index || index >= total) problems.push("Transaction order doesn’t match the quote.");
  if (!/^\d+$/.test(leg.inputAmount) || BigInt(leg.inputAmount) <= 0n) problems.push("Invalid input amount.");
  return problems;
}

/**
 * Same guard for a direct token sell: every leg must sell one of the picked mints for USDC, in
 * quote order, with a positive amount.
 */
export function tokenSellLabelProblems(leg: QuoteLeg, mints: readonly string[], index: number, total: number): string[] {
  const problems: string[] = [];
  if (!mints.includes(leg.inputMint)) problems.push("This transaction sells a token you didn’t pick.");
  if (leg.outputMint !== USDC_MINT) problems.push("This transaction doesn’t pay out USDC.");
  if (leg.index !== index || index >= total) problems.push("Transaction order doesn’t match the quote.");
  if (!/^\d+$/.test(leg.inputAmount) || BigInt(leg.inputAmount) <= 0n) problems.push("Invalid input amount.");
  return problems;
}

export type TradeSide = "buy" | "sell";

/** The bag token a leg trades: bought into on a buy, sold out of on a sell. */
export function legAssetMint(leg: Pick<QuoteLeg, "inputMint" | "outputMint">, side: TradeSide): string {
  return side === "sell" ? leg.inputMint : leg.outputMint;
}

/** Sum of every leg's USDC input, in base units. */
export function totalInput(legs: Pick<QuoteLeg, "inputAmount">[]): bigint {
  return legs.reduce((sum, leg) => sum + (/^\d+$/.test(leg.inputAmount) ? BigInt(leg.inputAmount) : 0n), 0n);
}

/** Sum of every leg's estimated output, in base units (USDC out on a sell). */
export function totalOutput(legs: Pick<QuoteLeg, "outAmount">[]): bigint {
  return legs.reduce((sum, leg) => sum + (/^\d+$/.test(leg.outAmount) ? BigInt(leg.outAmount) : 0n), 0n);
}

const FRIENDLY: Partial<Record<NonNullable<TradeError>["code"] | "INVALID_REQUEST", string>> = {
  NO_POSITION: "You don’t hold any of this bag’s tokens in your wallet.",
  INVALID_REQUEST: "That request wasn’t valid. Try again.",
  NO_WALLET: "Your wallet isn’t ready yet. Try again in a moment.",
  UNSUPPORTED_INPUT_MINT: "Only USDC can be used to buy bags.",
  PROVIDER_NOT_CONFIGURED: "Buying isn’t available on this server right now.",
  BAG_NOT_TRADABLE: "This bag isn’t open for buying yet.",
  AMOUNT_TOO_SMALL: "That amount is too small to split across this bag. Try a larger amount.",
  NO_ROUTE: "No swap route is available right now. Try a different amount or try later.",
  TOKEN_NOT_TRADABLE: "One of the tokens can’t be traded right now.",
  SLIPPAGE_REJECTED: "The price is moving too fast right now, so nothing was prepared. Try again in a moment.",
  QUOTE_MISMATCH: "Prices changed while building. Get a fresh quote and try again.",
  PROVIDER_ERROR: "The swap provider had a problem. Try again in a moment.",
  PROVIDER_TIMEOUT: "The swap provider took too long. Try again.",
  INVALID_TRANSACTION: "A transaction failed our safety checks, so nothing was prepared. Try again.",
};

/** User-facing message for a typed trade error; falls back to the server message. */
export function tradeErrorMessage(error: TradeError, fallback: string | null): string {
  if (!error) return fallback ?? "Something went wrong.";
  const base = FRIENDLY[error.code] ?? error.message;
  return error.symbol ? `${base} (${error.symbol})` : base;
}

const PRICE_MOVED = "The price moved more than your price protection allows, so nothing was swapped. Retry for a fresh price.";

/**
 * Plain-language reason for a swap that failed while sending or on chain. Raw RPC/program errors
 * ("custom program error: 0x1771") mean nothing to most users.
 */
export function friendlySwapError(raw: string | undefined, fallback: string): string {
  const text = raw ?? "";
  if (/0x1771|"Custom":\s?6001|SlippageToleranceExceeded|slippage/i.test(text)) return PRICE_MOVED;
  if (/blockhash not found|block height exceeded|expired/i.test(text)) {
    return "This swap waited too long and expired, so nothing was swapped. Retry for a fresh price.";
  }
  if (/insufficient (funds|lamports)|0x1\b/i.test(text)) return "There wasn't enough balance for this swap, so nothing was swapped.";
  if (/reject|cancel|denied/i.test(text)) return "Signing was cancelled.";
  if (/simulation failed/i.test(text)) return "This swap would fail right now, so it wasn't sent. Retry for a fresh price.";
  return text && text.length < 160 && !/^[{[]|program|instruction/i.test(text) ? text : fallback;
}

/** Price impact at or above this (percent) shows a thin-liquidity warning on the leg. */
export const IMPACT_WARN_PCT = 1;
/** Price impact at or above this (percent) requires an explicit extra confirmation. */
export const IMPACT_CONFIRM_PCT = 5;

export type ImpactLevel = "ok" | "warn" | "high" | "unknown";

/**
 * Jupiter's `priceImpactPct` (passed through unchanged by the API) is a fraction string:
 * "0.0214" means 2.14%. Returns the percentage, or null when missing/unparseable.
 */
export function impactPercent(priceImpactPct: string | null): number | null {
  if (priceImpactPct == null || priceImpactPct.trim() === "") return null;
  const value = Number(priceImpactPct);
  if (!Number.isFinite(value)) return null;
  return Math.abs(value) * 100;
}

export function impactLevel(priceImpactPct: string | null): ImpactLevel {
  const pct = impactPercent(priceImpactPct);
  if (pct == null) return "unknown";
  if (pct >= IMPACT_CONFIRM_PCT) return "high";
  if (pct >= IMPACT_WARN_PCT) return "warn";
  return "ok";
}

/** Legs whose impact needs an explicit confirmation before building or signing. */
export function highImpactLegs<L extends Pick<QuoteLeg, "priceImpactPct" | "symbol">>(legs: L[]): L[] {
  return legs.filter((leg) => impactLevel(leg.priceImpactPct) === "high");
}
