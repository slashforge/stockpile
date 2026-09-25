import { inspectTransaction } from "@/lib/solana/transaction";

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
      error: error instanceof Error ? error.message : "Signing was cancelled or failed.",
    });
  }
  onState({ status: "submitted", signature });

  const result = await waitForConfirmation(signature);
  if (result.status === "confirmed") return finish({ status: "confirmed", signature });
  if (result.status === "failed") {
    return finish({ status: "failed", signature, error: "Transaction failed on-chain. No tokens were swapped." });
  }
  // Unknown: stay "submitted"; it may still land. The user can check the explorer.
  return { status: "submitted", signature };
}
