import { inspectTransaction } from "@/lib/solana/transaction";
import { friendlySwapError } from "./legs";

export type LegSigningState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "submitted"; signature: string }
  | { status: "confirmed"; signature: string }
  | { status: "failed"; error: string; signature?: string };

export type ConfirmationResult = { status: "confirmed" | "failed" | "unknown"; error?: string };

/** Jupiter transactions carry a recent blockhash that expires after roughly a minute. */
export const PREPARED_TTL_MS = 60_000;

export function legSignature(state: LegSigningState | undefined): string | undefined {
  return state && "signature" in state ? state.signature : undefined;
}

/**
 * A leg may be (re)signed only if nothing was ever broadcast for it. Once a signature exists the
 * transaction may have landed, so re-sending is never offered; the user must rebuild instead.
 */
export function canSignLeg(state: LegSigningState | undefined): boolean {
  if (!state || state.status === "idle") return true;
  return state.status === "failed" && !state.signature;
}

export function tradeProgress(transactionCount: number, states: Record<number, LegSigningState>) {
  const list = Array.from({ length: transactionCount }, (_, index) => states[index]);
  return {
    started: list.some((state) => state && state.status !== "idle"),
    anySent: list.some((state) => !!legSignature(state)),
    confirmedCount: list.filter((state) => state?.status === "confirmed").length,
    allConfirmed: transactionCount > 0 && list.every((state) => state?.status === "confirmed"),
  };
}

export function isPreparedExpired(preparedAt: number | null, now: number): boolean {
  return preparedAt != null && now - preparedAt > PREPARED_TTL_MS;
}

/** Whole seconds left before a prepared set expires (0 once expired), or null if nothing is prepared. */
export function secondsUntilExpiry(preparedAt: number | null, now: number): number | null {
  if (preparedAt == null) return null;
  return Math.max(0, Math.ceil((PREPARED_TTL_MS - (now - preparedAt)) / 1000));
}

/** Output mints of legs that were broadcast and not reported failed (the purchase may have landed). */
export function boughtMints(outputMints: string[], states: Record<number, LegSigningState>): string[] {
  return outputMints.filter((_, index) => {
    const status = states[index]?.status;
    return status === "submitted" || status === "confirmed";
  });
}

/** Next leg after `after` that can still be signed and wasn't already bought in an earlier set. */
export function nextLegToSign(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  alreadyBought: ReadonlySet<string>,
  after: number,
): number | null {
  for (let index = after + 1; index < outputMints.length; index += 1) {
    if (canSignLeg(states[index]) && !alreadyBought.has(outputMints[index])) return index;
  }
  return null;
}

/**
 * True when every leg is either confirmed in this set or was already bought in an earlier set and
 * left unsigned here.
 */
export function purchaseComplete(
  outputMints: string[],
  states: Record<number, LegSigningState>,
  alreadyBought: ReadonlySet<string>,
): boolean {
  if (outputMints.length === 0) return false;
  const confirmedHere = outputMints.some((_, index) => states[index]?.status === "confirmed");
  if (!confirmedHere && alreadyBought.size === 0) return false;
  return outputMints.every((mint, index) => {
    const state = states[index];
    if (state?.status === "confirmed") return true;
    return alreadyBought.has(mint) && (!state || state.status === "idle");
  });
}

type SignLegDeps = {
  signAndSend: ((base64: string) => Promise<{ signature: string }>) | null;
  waitForConfirmation: (signature: string) => Promise<ConfirmationResult>;
  onState: (state: LegSigningState) => void;
};

/**
 * Signs and submits one user-approved transaction. Re-runs the on-device safety inspection
 * immediately before signing so no UI path can bypass it.
 */
export async function signLeg(
  base64: string,
  walletAddress: string | null,
  { signAndSend, waitForConfirmation, onState }: SignLegDeps,
): Promise<LegSigningState> {
  const finish = (state: LegSigningState) => {
    onState(state);
    return state;
  };

  if (!signAndSend || !walletAddress) {
    return finish({ status: "failed", error: "Wallet not ready yet. Try again in a moment." });
  }
  let blocking: string[];
  try {
    blocking = inspectTransaction(base64, walletAddress).errors;
  } catch (error) {
    blocking = [error instanceof Error ? error.message : "Could not decode transaction"];
  }
  if (blocking.length > 0) {
    return finish({ status: "failed", error: `Blocked: ${blocking.join(" ")}` });
  }

  onState({ status: "signing" });
  let signature: string;
  try {
    ({ signature } = await signAndSend(base64));
  } catch (error) {
    return finish({
      status: "failed",
      error: friendlySwapError(error instanceof Error ? error.message : undefined, "Signing was cancelled or failed."),
    });
  }
  onState({ status: "submitted", signature });

  const result = await waitForConfirmation(signature);
  if (result.status === "confirmed") return finish({ status: "confirmed", signature });
  if (result.status === "failed") {
    return finish({ status: "failed", signature, error: friendlySwapError(result.error, "Transaction failed on-chain. No tokens were swapped.") });
  }
  // Unknown: stay "submitted"; it may still land. The user can check the explorer.
  return { status: "submitted", signature };
}
