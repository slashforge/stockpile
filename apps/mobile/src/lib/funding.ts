import type { SpendableBalance } from "@/lib/trade/balance";

/** Subset of Privy's `AppResponse.funding_config` (dashboard: Wallets → Funding). */
export type PrivyFundingConfig = {
  methods?: string[] | null;
  options?: { method: string; provider: string }[] | null;
  default_recommended_amount?: string | null;
} | null;

const CARD_PROVIDERS = new Set(["moonpay", "coinbase-onramp"]);

/**
 * Card onramp is usable only when the Privy dashboard has a card provider enabled. Without it
 * `fundWallet` would open an empty flow, so the button stays hidden.
 */
export function cardFundingAvailable(
  config: PrivyFundingConfig | undefined,
): boolean {
  if (!config) return false;
  if ((config.methods ?? []).some((method) => CARD_PROVIDERS.has(method)))
    return true;
  return (config.options ?? []).some(
    (option) => option.method === "card" || CARD_PROVIDERS.has(option.provider),
  );
}

/** Suggested card purchase in USDC: the dashboard default when numeric, else $25. */
export function suggestedFundingAmount(
  config: PrivyFundingConfig | undefined,
): string {
  const amount = config?.default_recommended_amount?.trim();
  return amount && /^\d+(\.\d+)?$/.test(amount) && Number(amount) > 0
    ? amount
    : "25";
}

/** 0.005 SOL covers several swaps; below it we nudge the user to add a little SOL for fees. */
export const LOW_SOL_LAMPORTS = 5_000_000n;

/** True only when the SOL balance is known and below the fee threshold (never guessed). */
export function isLowSol(sol: SpendableBalance): boolean {
  return sol.status === "known" && sol.raw < LOW_SOL_LAMPORTS;
}
