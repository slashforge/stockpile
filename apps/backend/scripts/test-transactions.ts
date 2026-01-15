/// <reference path="../sst-env.d.ts" />
import { Resource } from "sst";

// ============================================================
// CONFIGURATION - Edit these values to test different scenarios
// ============================================================

const TEST_WALLET = "BcbQANKUUBSo3fBHS97vMXW55yd2KBtHcNdz3cTZmdTA";

const LIMIT = 10;

const STATUS: "succeeded" | "failed" | "any" = "succeeded";

// ============================================================
// Types
// ============================================================

interface TransactionFilters {
  status?: "succeeded" | "failed" | "any";
  blockTime?: {
    gte?: number;
    lte?: number;
    gt?: number;
    lt?: number;
  };
}

interface GetTransactionsParams {
  transactionDetails?: "signatures" | "full";
  sortOrder?: "asc" | "desc";
  limit?: number;
  paginationToken?: string;
  encoding?: "json" | "jsonParsed" | "base64" | "base58";
  maxSupportedTransactionVersion?: number;
  filters?: TransactionFilters;
}

interface FullTransactionData {
  slot: number;
  blockTime?: number;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: unknown[];
    };
  };
  meta: {
    fee: number;
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        uiAmount: number | null;
        decimals: number;
        amount: string;
      };
      owner?: string;
    }>;
    postTokenBalances?: Array<{
      accountIndex: number;
      mint: string;
      uiTokenAmount: {
        uiAmount: number | null;
        decimals: number;
        amount: string;
      };
      owner?: string;
    }>;
  };
}

interface HeliusResponse {
  jsonrpc: string;
  id: number;
  result?: {
    data: FullTransactionData[];
    paginationToken?: string;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ============================================================
// Script - No need to edit below
// ============================================================

async function getTransactionsForAddress(
  address: string,
  params: GetTransactionsParams = {}
): Promise<{ data: FullTransactionData[]; paginationToken?: string }> {
  const response = await fetch(Resource.HeliusRpcUrl.value, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransactionsForAddress",
      params: [address, params],
    }),
  });

  const json = (await response.json()) as HeliusResponse;

  if (json.error) {
    throw new Error(`Helius RPC error: ${json.error.message}`);
  }

  return {
    data: json.result?.data ?? [],
    paginationToken: json.result?.paginationToken,
  };
}

function calculateSolChange(tx: FullTransactionData, address: string): number {
  const accountKeys = tx.transaction.message.accountKeys;
  const accountIndex = accountKeys.findIndex((k) => k.pubkey === address);

  if (accountIndex === -1) return 0;

  const preBalance = tx.meta.preBalances[accountIndex] ?? 0;
  const postBalance = tx.meta.postBalances[accountIndex] ?? 0;

  return (postBalance - preBalance) / 1e9;
}

interface TokenChange {
  mint: string;
  change: number;
  decimals: number;
}

function calculateTokenChanges(tx: FullTransactionData, address: string): TokenChange[] {
  const preBalances = tx.meta.preTokenBalances ?? [];
  const postBalances = tx.meta.postTokenBalances ?? [];

  const balanceMap = new Map<string, { pre: number; post: number; decimals: number }>();

  for (const bal of preBalances) {
    if (bal.owner === address) {
      balanceMap.set(bal.mint, {
        pre: Number(bal.uiTokenAmount.amount),
        post: 0,
        decimals: bal.uiTokenAmount.decimals,
      });
    }
  }

  for (const bal of postBalances) {
    if (bal.owner === address) {
      const existing = balanceMap.get(bal.mint);
      if (existing) {
        existing.post = Number(bal.uiTokenAmount.amount);
      } else {
        balanceMap.set(bal.mint, {
          pre: 0,
          post: Number(bal.uiTokenAmount.amount),
          decimals: bal.uiTokenAmount.decimals,
        });
      }
    }
  }

  const changes: TokenChange[] = [];
  for (const [mint, { pre, post, decimals }] of balanceMap) {
    const change = (post - pre) / Math.pow(10, decimals);
    if (change !== 0) {
      changes.push({ mint, change, decimals });
    }
  }

  return changes;
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("         Helius getTransactionsForAddress Test Script");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log(`📍 Wallet: ${TEST_WALLET}`);
  console.log(`📊 Limit: ${LIMIT} | Status: ${STATUS}\n`);

  // 1. Fetch transactions
  console.log("🔄 Fetching transactions...\n");

  const result = await getTransactionsForAddress(TEST_WALLET, {
    transactionDetails: "full",
    sortOrder: "desc",
    limit: LIMIT,
    encoding: "jsonParsed",
    maxSupportedTransactionVersion: 0,
    filters: {
      status: STATUS,
    },
  });

  console.log(`✅ Found ${result.data.length} transactions\n`);

  // 2. Display transactions
  for (let i = 0; i < result.data.length; i++) {
    const tx = result.data[i];
    const signature = tx.transaction.signatures[0];
    const fee = tx.meta.fee;
    const success = tx.meta.err === null;
    const blockTime = tx.blockTime;
    const date = blockTime ? new Date(blockTime * 1000).toLocaleString() : "Unknown";

    const solChange = calculateSolChange(tx, TEST_WALLET);
    const tokenChanges = calculateTokenChanges(tx, TEST_WALLET);

    console.log(`───────────────────────────────────────────────────────────────`);
    console.log(`Transaction #${i + 1}`);
    console.log(`───────────────────────────────────────────────────────────────`);
    console.log(`   Signature: ${signature.slice(0, 20)}...${signature.slice(-8)}`);
    console.log(`   Slot: ${tx.slot}`);
    console.log(`   Time: ${date}`);
    console.log(`   Status: ${success ? "✅ Success" : "❌ Failed"}`);
    console.log(`   Fee: ${fee} lamports (${(fee / 1e9).toFixed(6)} SOL)`);
    console.log(`   SOL Change: ${solChange >= 0 ? "+" : ""}${solChange.toFixed(6)} SOL`);

    if (tokenChanges.length > 0) {
      console.log(`   Token Changes:`);
      for (const tc of tokenChanges) {
        const sign = tc.change >= 0 ? "+" : "";
        console.log(`      - ${tc.mint.slice(0, 8)}...: ${sign}${tc.change.toFixed(tc.decimals)}`);
      }
    }
    console.log("");
  }

  // 3. Pagination info
  if (result.paginationToken) {
    console.log(`📄 Next Page Cursor: ${result.paginationToken}`);
    console.log(`   Use this cursor to fetch the next page of transactions\n`);
  } else {
    console.log(`📄 No more transactions (end of history)\n`);
  }

  // 4. Raw response preview
  console.log("───────────────────────────────────────────────────────────────");
  console.log("Frontend-Ready Response Preview:");
  console.log("───────────────────────────────────────────────────────────────");

  const frontendResponse = {
    transactions: result.data.slice(0, 3).map((tx) => ({
      signature: tx.transaction.signatures[0],
      slot: tx.slot,
      blockTime: tx.blockTime,
      success: tx.meta.err === null,
      fee: tx.meta.fee,
      solChange: calculateSolChange(tx, TEST_WALLET),
      tokenChanges: calculateTokenChanges(tx, TEST_WALLET),
    })),
    cursor: result.paginationToken,
  };

  console.log(JSON.stringify(frontendResponse, null, 2));

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                         ✅ Done!");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
