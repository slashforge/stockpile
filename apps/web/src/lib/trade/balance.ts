import { USDC_DECIMALS } from "@/lib/solana/transaction";
import type { Balance, Portfolio } from "@/services/api/types";

export type SpendableBalance =
  | { status: "known"; raw: bigint; decimals: number }
  | { status: "unknown"; reason: string };

function readBalance(balance: Balance, expectedDecimals: number): SpendableBalance {
  if (!balance) return { status: "unknown", reason: "Your balance isn’t available right now." };
  if (!/^\d+$/.test(balance.amount) || balance.decimals !== expectedDecimals) {
    return { status: "unknown", reason: "Your balance couldn’t be read." };
  }
  return { status: "known", raw: BigInt(balance.amount), decimals: balance.decimals };
}

/**
 * USDC available to spend, from the live on-chain portfolio (`usdc` is the server's sum of all USDC
 * accounts). Unavailable portfolios yield "unknown", never a guessed number.
 */
export function spendableUsdc(portfolio: Portfolio | undefined): SpendableBalance {
  if (!portfolio) return { status: "unknown", reason: "Checking your balance…" };
  if (portfolio.status !== "live") {
    return { status: "unknown", reason: portfolio.message ?? "Your balance isn’t available right now." };
  }
  return readBalance(portfolio.usdc, USDC_DECIMALS);
}

/** SOL (lamports) for network fees. */
export function solBalance(portfolio: Portfolio | undefined): SpendableBalance {
  if (!portfolio || portfolio.status !== "live") return { status: "unknown", reason: "Unavailable" };
  return readBalance(portfolio.sol, 9);
}

export const DEFAULT_BUY_USD = 25n;

/**
 * Starting amount for the buy numpad: min($25, whole dollars of the balance). Balances under $1 start
 * empty ($0) so the sheet leads with "Add USDC". Unknown balances fall back to $25.
 */
export function defaultBuyAmount(balance: SpendableBalance): string {
  if (balance.status !== "known") return DEFAULT_BUY_USD.toString();
  const whole = balance.raw / 10n ** BigInt(balance.decimals);
  const amount = whole < DEFAULT_BUY_USD ? whole : DEFAULT_BUY_USD;
  return amount > 0n ? amount.toString() : "";
}

/** True when a known balance is below one whole unit (less than $1 of USDC). */
export function belowOneUnit(balance: SpendableBalance): boolean {
  return balance.status === "known" && balance.raw < 10n ** BigInt(balance.decimals);
}

/** True when the requested amount (base units) exceeds a known balance. Unknown balances never block. */
export function exceedsBalance(amount: string | null, balance: SpendableBalance): boolean {
  if (!amount || balance.status !== "known") return false;
  return BigInt(amount) > balance.raw;
}
