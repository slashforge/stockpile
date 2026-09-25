import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/config/env";
import { fetchTransactionStatuses } from "@/services/api/stockpile";
import { createConfirmationPoller } from "./confirmations";

export type { ConfirmationStatus } from "./confirmations";

let connection: Connection | null = null;

/** Read-only fallback (mint decimals). Sending and confirming go through the Stockpile API. */
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

/** Batched confirmation through Stockpile's `/trade/status` (Helius), shared by every in-flight swap. */
export const waitForConfirmation = createConfirmationPoller(fetchTransactionStatuses);
