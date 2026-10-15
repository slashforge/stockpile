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

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  return "1".repeat(zeros) + out;
}

/**
 * A Solana transaction's id is its first (fee payer) signature, so it is known as soon as the
 * transaction is fully signed, before and regardless of whether the broadcast request succeeds.
 */
export function transactionSignature(tx: { signatures: Uint8Array[] }): string | null {
  const first = tx.signatures[0];
  if (!first || first.every((byte) => byte === 0)) return null;
  return base58(first);
}

/**
 * Thrown by `signAndSendTransaction` when the wallet signed but the broadcast request failed.
 * `definite` means the server rejected it before broadcasting (nothing can land, safe to rebuild);
 * otherwise the outcome is unknown and the leg must be confirmed via `signature`, never re-sent.
 */
export class SubmissionError extends Error {
  constructor(
    message: string,
    readonly signature: string,
    readonly definite: boolean,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

/**
 * HTTP status of a failed submit -> whether the transaction certainly wasn't broadcast. 4xx are
 * rejections before broadcast (bad signature, preflight, auth, rate limit); network errors (0),
 * timeouts and 5xx may have broadcast anyway.
 */
export function definiteRejection(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408;
}

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

/**
 * Legs broadcast in earlier prepared sets of this run, keyed by the bag token mint they trade.
 * "submitted" is still pending (never re-sent, not yet counted as done), "confirmed" is done and
 * "failed" landed as a failure or expired unlanded (that mint can be traded again).
 * `lastValidBlockHeight` is kept so status polls can still detect expiry.
 */
export type CarriedLeg = LegSigningState & { signature: string; lastValidBlockHeight?: number | null };
export type CarriedLegs = Readonly<Record<string, CarriedLeg>>;

export const NO_CARRIED: CarriedLegs = Object.freeze({});

/** True when a carried leg may still land or already did, so its mint must not be traded again. */
export function carriedBlocks(carried: LegSigningState | undefined): boolean {
  return carried?.status === "submitted" || carried?.status === "confirmed";
}

/**
 * Carries everything broadcast so far into the next prepared set: earlier carried legs plus every
 * leg of the current set that has a signature (with its prepared `lastValidBlockHeights[index]`).
 * Failures are dropped so their mints get rebuilt.
 */
export function carryLegs(
  previous: CarriedLegs,
  assetMints: string[],
  states: Record<number, LegSigningState>,
  lastValidBlockHeights: readonly (number | null | undefined)[] = [],
): CarriedLegs {
  const next: Record<string, CarriedLeg> = { ...previous };
  assetMints.forEach((mint, index) => {
    const state = states[index];
    const signature = legSignature(state);
    if (state && signature) next[mint] = { ...state, signature, lastValidBlockHeight: lastValidBlockHeights[index] ?? null };
  });
  for (const [mint, state] of Object.entries(next)) {
    if (state.status === "failed") delete next[mint];
  }
  return next;
}

/** Each prepared leg's blockhash expiry, by leg index (empty when nothing ready is prepared). */
export function legHeights(
  prepared: { status: string; transactions: { lastValidBlockHeight: number | null }[] } | null,
): (number | null)[] {
  return prepared?.status === "ready" ? prepared.transactions.map((tx) => tx.lastValidBlockHeight) : [];
}

/** Applies a status-poll result to a carried pending leg, if it still tracks that signature. */
export function applyCarriedConfirmation(
  carried: CarriedLegs,
  mint: string,
  signature: string,
  result: ConfirmationResult,
): CarriedLegs {
  const current = carried[mint];
  if (!current || current.signature !== signature || current.status !== "submitted") return carried;
  const { lastValidBlockHeight } = current;
  if (result.status === "confirmed") return { ...carried, [mint]: { status: "confirmed", signature, lastValidBlockHeight } };
  if (result.status === "failed") {
    const error = friendlySwapError(result.error, "Transaction failed on-chain. No tokens were swapped.");
    return { ...carried, [mint]: { status: "failed", signature, error, lastValidBlockHeight } };
  }
  return carried;
}

/** Re-polls a signature a few times while the outcome stays unknown. */
export async function pollUntilSettled(
  signature: string,
  waitForConfirmation: (signature: string) => Promise<ConfirmationResult>,
  attempts = 3,
): Promise<ConfirmationResult> {
  let result: ConfirmationResult = { status: "unknown" };
  for (let attempt = 0; attempt < attempts && result.status === "unknown"; attempt += 1) {
    result = await waitForConfirmation(signature);
  }
  return result;
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
    // Signed but the broadcast's outcome is unknown: it may have landed, so track it by signature
    // like any submitted leg instead of offering a re-send that could swap twice.
    if (error instanceof SubmissionError && !error.definite && error.signature) {
      signature = error.signature;
    } else {
      return finish({
        status: "failed",
        error: friendlySwapError(error instanceof Error ? error.message : undefined, "Signing was cancelled or failed."),
      });
    }
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
