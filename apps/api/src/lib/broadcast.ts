import { VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { paymaster, rpcUrl } from "./sponsor";
import { execute, JupiterError } from "./jupiter";

/**
 * Broadcast and confirmation for wallet-signed swaps, relayed server-side so the app never talks to
 * a public RPC (rate-limited) or ships an RPC key. Only transactions the caller's own wallet has
 * signed, paid by that wallet or the Stockpile paymaster, are relayed.
 *
 * Orders with a requestId use Jupiter Swap v2 execute. Legacy clients still send two ways:
 * - Helius RPC `sendTransaction` with preflight first, which rejects swaps that would fail
 *   (slippage, balance) before they cost anything and keeps rebroadcasting until the blockhash expires.
 * - Then Helius Sender (SWQOS-only, skipPreflight) for fast landing of legacy tipped transactions.
 *   If the RPC is busy, Sender alone carries the transaction.
 */

export const MAX_STATUS_SIGNATURES = 50;
export const SENDER_URL = "https://sender.helius-rpc.com/fast?swqos_only=true";

type RpcError = { code?: number; message?: string; data?: { err?: unknown; logs?: string[] | null } };

class RpcUnavailable extends Error {}

async function heliusRpc<T>(url: string, method: string, params: unknown[], retries = 2): Promise<{ result?: T; error?: RpcError }> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      if (attempt < retries) { await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1))); continue; }
      throw new RpcUnavailable(error instanceof Error ? error.message : "RPC unreachable");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) { await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1))); continue; }
    if (!res.ok) throw new RpcUnavailable(`RPC ${method} ${res.status}`);
    return await res.json() as { result?: T; error?: RpcError };
  }
}

/** Best effort: Sender only speeds landing up; the RPC path decides success and errors. */
async function sendViaSender(base64: string): Promise<boolean> {
  try {
    const { error } = await heliusRpc<string>(SENDER_URL, "sendTransaction", [base64, { encoding: "base64", skipPreflight: true, maxRetries: 0 }], 1);
    if (error) console.warn("Helius Sender rejected transaction", error.message);
    return !error;
  } catch (error) {
    console.warn("Helius Sender unavailable", error instanceof Error ? error.message : error);
    return false;
  }
}

export type SubmitResult =
  | { ok: true; signature: string }
  | { ok: false; status: 400 | 503; error: string };

/** Signers the relay accepts: the wallet must sign; the fee payer is the wallet or the paymaster. */
export function relayProblem(tx: VersionedTransaction, walletAddress: string, paymasterAddress: string | null): string | null {
  const keys = tx.message.staticAccountKeys.map((key) => key.toBase58());
  const signers = keys.slice(0, tx.message.header.numRequiredSignatures);
  const walletIndex = signers.indexOf(walletAddress);
  if (walletIndex < 0) return "Your wallet is not a signer on this transaction";
  if (signers[0] !== walletAddress && signers[0] !== paymasterAddress) return "Unexpected fee payer";
  if (signers.some((key) => key !== walletAddress && key !== paymasterAddress)) return "Unexpected signer";
  if (tx.signatures.some((signature) => signature.every((byte) => byte === 0))) return "Transaction is not fully signed";
  return null;
}

/** Preflight failures keep the program error / relevant log line so the app can explain them. */
function sendError(error: RpcError): string {
  const message = error.message ?? "Transaction was rejected";
  const hint = (error.data?.logs ?? []).find((line) => /0x1771|SlippageToleranceExceeded|insufficient/i.test(line));
  return hint ? `${message} (${hint})` : message;
}

function definitiveRejection(error: RpcError): boolean {
  if ([-32603, -32004, -32005, -32014, -32016, 429].includes(error.code ?? 0)) return false;
  if (/internal|rate.?limit|too many requests|unavailable|unhealthy|node.*behind|minimum context slot|block.*not available/i.test(error.message ?? "")) return false;
  return true;
}

const definitiveExecuteCodes = new Set([-1, -2, -3, -4, -5, -1002, -1003, -1004, -2002, -2003, -2004]);

export async function submitSigned(base64: string, walletAddress: string, requestId?: string): Promise<SubmitResult> {
  const url = rpcUrl();
  if (!requestId && !url) return { ok: false, status: 503, error: "Transaction provider is not configured" };
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
  } catch {
    return { ok: false, status: 400, error: "Transaction could not be decoded" };
  }
  const problem = relayProblem(tx, walletAddress, paymaster()?.publicKey.toBase58() ?? null);
  if (problem) return { ok: false, status: 400, error: problem };
  if (requestId) {
    try {
      const result = await execute(base64, requestId);
      if (typeof result.signature === "string" && result.signature) return { ok: true, signature: result.signature };
      return { ok: false, status: definitiveExecuteCodes.has(result.code ?? 0) ? 400 : 503, error: result.error ?? "Jupiter could not execute the order" };
    } catch (error) {
      const definitive = error instanceof JupiterError && error.status !== null && error.status < 500 && error.status !== 429 && typeof error.code === "number" && definitiveExecuteCodes.has(error.code);
      return { ok: false, status: definitive ? 400 : 503, error: error instanceof Error ? error.message : "Jupiter execution unavailable" };
    }
  }
  const signature = bs58.encode(tx.signatures[0]!);
  try {
    const { result, error } = await heliusRpc<string>(url!, "sendTransaction", [base64, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 3 }]);
    if (error) {
      // A resend of something already accepted is fine: the signature is what the app tracks.
      if (/already been processed/i.test(error.message ?? "")) return { ok: true, signature };
      if (definitiveRejection(error)) return { ok: false, status: 400, error: sendError(error) };
      throw new RpcUnavailable(error.message ?? "RPC unavailable");
    }
    await sendViaSender(base64);
    return { ok: true, signature: result ?? signature };
  } catch (error) {
    // RPC busy but Sender took it: the app confirms by signature, so report it as sent.
    if (await sendViaSender(base64)) return { ok: true, signature };
    return { ok: false, status: 503, error: error instanceof RpcUnavailable ? "Transaction provider is busy. Try again in a moment." : "Transaction provider unavailable" };
  }
}

export type SignatureStatus = { signature: string; status: "pending" | "confirmed" | "failed"; error: string | null };

export async function readStatuses(signatures: string[], lastValidBlockHeight: Record<string, number> = {}): Promise<{ ok: true; statuses: SignatureStatus[] } | { ok: false; error: string }> {
  const url = rpcUrl();
  if (!url) return { ok: false, error: "Transaction provider is not configured" };
  try {
    const { result, error } = await heliusRpc<{ value: ({ err: unknown; confirmationStatus?: string | null } | null)[] }>(url, "getSignatureStatuses", [signatures, { searchTransactionHistory: true }]);
    if (error || !result) return { ok: false, error: error?.message ?? "Status lookup failed" };
    let blockHeight: number | undefined;
    if (signatures.some((signature, index) => result.value[index] === null && Number.isSafeInteger(lastValidBlockHeight[signature]))) {
      const height = await heliusRpc<number>(url, "getBlockHeight", [{ commitment: "confirmed" }]);
      if (!height.error && Number.isSafeInteger(height.result)) blockHeight = height.result;
    }
    return {
      ok: true,
      statuses: signatures.map((signature, index) => {
        const value = result.value[index];
        if (value?.err) return { signature, status: "failed" as const, error: JSON.stringify(value.err) };
        if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return { signature, status: "confirmed" as const, error: null };
        if (value === null && blockHeight !== undefined && lastValidBlockHeight[signature] !== undefined && blockHeight > lastValidBlockHeight[signature]!) return { signature, status: "failed" as const, error: "expired" };
        return { signature, status: "pending" as const, error: null };
      }),
    };
  } catch {
    return { ok: false, error: "Transaction provider is busy. Try again in a moment." };
  }
}
