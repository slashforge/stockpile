import { canSignLeg, type LegSigningState } from "./signing";

/** Whole-bag purchase status, aggregated from each leg's signing state. */
export type PurchaseStatus =
  /** Nothing sent yet. */
  | "idle"
  /** At least one leg is signing or waiting for confirmation. */
  | "running"
  /** Every leg confirmed (or was bought in an earlier set). */
  | "complete"
  /** Nothing in flight, but some legs failed or never got sent. */
  | "partial";

export type LegDisplayStatus = "queued" | "signing" | "submitted" | "confirmed" | "earlier" | "failed";

export function legDisplayStatus(
  state: LegSigningState | undefined,
  alreadyBought: boolean,
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
    default:
      return alreadyBought ? "earlier" : "queued";
  }
}

/** Indices of legs that should be signed now: never broadcast here and not bought in an earlier set. */
export function legsToSign(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  alreadyBought: ReadonlySet<string>,
): number[] {
  return outputMints.flatMap((mint, index) =>
    canSignLeg(states[index]) && !alreadyBought.has(mint) ? [index] : [],
  );
}

/**
 * `inFlight` is true while a sign-all run is still awaiting results. A leg whose confirmation timed
 * out stays "submitted" after the run ends; it may still land, so the purchase reads as partial.
 */
export function purchaseStatus(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  alreadyBought: ReadonlySet<string>,
  inFlight = false,
): PurchaseStatus {
  if (outputMints.length === 0) return "idle";
  const display = outputMints.map((mint, index) =>
    legDisplayStatus(states[index], alreadyBought.has(mint)),
  );
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
