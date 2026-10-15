import { type CarriedLegs, carriedBlocks, canSignLeg, type LegSigningState } from "./signing";

/** Whole-bag purchase status, aggregated from each leg's signing state. */
export type PurchaseStatus =
  /** Nothing sent yet. */
  | "idle"
  /** At least one leg is signing or waiting for confirmation. */
  | "running"
  /** Every leg confirmed (here or in an earlier set). Pending legs never count. */
  | "complete"
  /** Nothing in flight, but some legs failed or never got sent. */
  | "partial";

export type LegDisplayStatus = "queued" | "signing" | "submitted" | "confirmed" | "earlier" | "failed";

export function legDisplayStatus(
  state: LegSigningState | undefined,
  carried: LegSigningState | undefined,
): LegDisplayStatus {
  switch (state?.status) {
    case "signing":
      return "signing";
    case "submitted":
      return "submitted";
    case "confirmed":
      return "confirmed";
    case "failed":
      return "failed";
  }
  switch (carried?.status) {
    case "confirmed":
      return "earlier";
    case "submitted":
      return "submitted";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

/**
 * What a leg row shows: this set's state once it has one, else the leg carried from an earlier set
 * (so pending/failed carried legs keep their explorer link and error).
 */
export function shownLegState(
  state: LegSigningState | undefined,
  carried: LegSigningState | undefined,
): LegSigningState | undefined {
  return state && state.status !== "idle" ? state : carried;
}

/** Indices of legs that should be signed now: never broadcast here and not pending/done in an earlier set. */
export function legsToSign(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  carried: CarriedLegs,
): number[] {
  return outputMints.flatMap((mint, index) =>
    canSignLeg(states[index]) && !carriedBlocks(carried[mint]) ? [index] : [],
  );
}

/**
 * Legs a retry would rebuild: never sent or definitively failed here (on chain or expired, so a
 * fresh transaction can't double up), plus carried legs that failed and aren't in this set.
 * Pending legs, here or carried, are never rebuilt.
 */
export function retryableCount(
  assetMints: string[],
  states: Record<number, LegSigningState>,
  carried: CarriedLegs,
): number {
  const outside = Object.entries(carried).filter(
    ([mint, state]) => state.status === "failed" && !assetMints.includes(mint),
  ).length;
  const here = assetMints.filter(
    (mint, index) =>
      (canSignLeg(states[index]) || states[index]?.status === "failed") && !carriedBlocks(carried[mint]),
  ).length;
  return here + outside;
}

/** Carried legs confirmed in earlier sets. */
export function confirmedEarlier(carried: CarriedLegs): number {
  return Object.values(carried).filter((state) => state.status === "confirmed").length;
}

/**
 * `inFlight` is true while a sign-all run is still awaiting results. A leg whose confirmation timed
 * out stays "submitted" after the run ends; it may still land, so the purchase reads as partial.
 * Carried legs outside this set (e.g. a pending sell of a token no longer in the rebuild) count too.
 */
export function purchaseStatus(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  carried: CarriedLegs,
  inFlight = false,
): PurchaseStatus {
  if (outputMints.length === 0) return "idle";
  const display = [
    ...outputMints.map((mint, index) => legDisplayStatus(states[index], carried[mint])),
    ...Object.entries(carried)
      .filter(([mint]) => !outputMints.includes(mint))
      .map(([, state]) => legDisplayStatus(undefined, state)),
  ];
  if (display.includes("signing")) return "running";
  if (inFlight && display.includes("submitted")) return "running";
  if (display.every((status) => status === "confirmed" || status === "earlier")) return "complete";
  if (display.every((status) => status === "queued" || status === "earlier")) return "idle";
  return "partial";
}

/** Body of the single confirmation shown before every leg of a bag is signed. */
export function purchaseConfirmMessage({
  swaps,
  totalUsdc,
  slippageBps,
  risky,
}: {
  swaps: number;
  totalUsdc: string;
  slippageBps: number;
  risky: { symbol: string; impactPct: number | null }[];
}): string {
  const lines = [
    `${swaps} ${swaps === 1 ? "swap" : "swaps"} for ${totalUsdc} USDC total, signed and sent together from your wallet.`,
    `Slippage limit ${slippageBps / 100}%: what you receive can differ from the estimate within it.`,
  ];
  if (risky.length > 0) {
    lines.push(
      `High price impact (thin liquidity):\n${risky
        .map((leg) => `${leg.symbol}: ${leg.impactPct == null ? "unknown" : `${leg.impactPct.toFixed(2)}%`}`)
        .join("\n")}`,
    );
  }
  lines.push("This can’t be undone.");
  return lines.join("\n\n");
}

/** Body of the single confirmation shown before every sell leg of a bag is signed. */
export function sellConfirmMessage({
  swaps,
  portionPct,
  totalUsdc,
  slippageBps,
  risky,
}: {
  swaps: number;
  portionPct: number;
  totalUsdc: string;
  slippageBps: number;
  risky: { symbol: string; impactPct: number | null }[];
}): string {
  const lines = [
    `${swaps} ${swaps === 1 ? "swap" : "swaps"} sell ${portionPct}% of this bag’s tokens in your wallet and swap them to USDC (about ${totalUsdc} USDC back), signed and sent together.`,
    `Slippage limit ${slippageBps / 100}%: the USDC you receive can differ from the estimate within it.`,
  ];
  if (risky.length > 0) {
    lines.push(
      `High price impact (thin liquidity):\n${risky
        .map((leg) => `${leg.symbol}: ${leg.impactPct == null ? "unknown" : `${leg.impactPct.toFixed(2)}%`}`)
        .join("\n")}`,
    );
  }
  lines.push("This can’t be undone.");
  return lines.join("\n\n");
}

/** Legs that failed and can be bought again with a fresh prepared set. */
export function failedLegIndices(states: Record<number, LegSigningState>, count: number): number[] {
  return Array.from({ length: count }, (_, index) => index).filter(
    (index) => states[index]?.status === "failed",
  );
}

/**
 * Wraps an async function so calls run one at a time, in call order. Used to hand the wallet one
 * transaction at a time while confirmations are still awaited concurrently.
 */
export function serialize<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => undefined);
    return run;
  };
}
