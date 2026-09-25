import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/config/env";

let connection: Connection | null = null;

export function getConnection(): Connection {
  connection ??= new Connection(SOLANA_RPC_URL, "confirmed");
  return connection;
}

/** Reads SPL mint decimals from chain. Missing/non-mint accounts are omitted. */
export async function fetchMintDecimals(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const keys = mints.map((mint) => new PublicKey(mint));
  const accounts = await getConnection().getMultipleParsedAccounts(keys);
  const result: Record<string, number> = {};
  accounts.value.forEach((account, index) => {
    const data = account?.data;
    if (data && "parsed" in data && data.parsed?.type === "mint") {
      const decimals = data.parsed.info?.decimals;
      if (typeof decimals === "number") result[mints[index]] = decimals;
    }
  });
  return result;
}

export type ConfirmationStatus = "confirmed" | "failed" | "unknown";

/** Polls signature status until confirmed/finalized, failed, or timeout. */
export async function waitForConfirmation(
  signature: string,
  { timeoutMs = 45_000, intervalMs = 2_000 } = {},
): Promise<{ status: ConfirmationStatus; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { value } = await getConnection().getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = value[0];
      if (status?.err) return { status: "failed", error: JSON.stringify(status.err) };
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        return { status: "confirmed" };
      }
    } catch {
      // transient RPC failure; keep polling until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { status: "unknown" };
}
