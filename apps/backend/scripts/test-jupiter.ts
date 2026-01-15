/// <reference path="../sst-env.d.ts" />
import { Resource } from "sst";
import { JupiterUltraClient } from "../src/lib/jupiter-ultra";

// ============================================================
// CONFIGURATION - Edit these values to test different scenarios
// ============================================================

const MY_WALLET = "BcbQANKUUBSo3fBHS97vMXW55yd2KBtHcNdz3cTZmdTA";

const SWAP_AMOUNT = "100000000"; // 0.1 SOL (in lamports)

const SEARCH_QUERY = "JUP";

// ============================================================
// Token Mints
// ============================================================

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";

// ============================================================
// Script - No need to edit below
// ============================================================

const client = new JupiterUltraClient(Resource.JupiterApiKey.value);

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("              Jupiter Ultra API Test Script");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Routers
  console.log("🔀 Available Routers:");
  const routers = await client.routers();
  for (const r of routers) {
    console.log(`   - ${r.name} (${r.id})`);
  }

  // 2. Search
  console.log(`\n🔍 Search: "${SEARCH_QUERY}"`);
  const tokens = await client.search(SEARCH_QUERY);
  for (const t of tokens.slice(0, 5)) {
    console.log(`   - ${t.symbol}: $${t.usdPrice?.toFixed(6) ?? "?"} | MCap: $${t.mcap?.toLocaleString() ?? "?"} | ${t.isVerified ? "✅" : "❌"}`);
  }

  // 3. Shield
  console.log(`\n🛡️ Token Safety:`);
  const shield = await client.shield([SOL, USDC, JUP]);
  for (const [mint, warnings] of Object.entries(shield.warnings)) {
    const label = mint === SOL ? "SOL" : mint === USDC ? "USDC" : mint === JUP ? "JUP" : mint.slice(0, 8);
    if (warnings.length === 0) {
      console.log(`   ✅ ${label}: Safe`);
    } else {
      console.log(`   ⚠️ ${label}: ${warnings.map((w) => w.type).join(", ")}`);
    }
  }

  // 4. Holdings
  console.log(`\n💰 Holdings for ${MY_WALLET.slice(0, 8)}...:`);
  const holdings = await client.holdings(MY_WALLET);
  console.log(`   SOL: ${holdings.uiAmount}`);
  const tokenCount = Object.keys(holdings.tokens).length;
  console.log(`   Tokens: ${tokenCount}`);
  let i = 0;
  for (const [mint, accs] of Object.entries(holdings.tokens)) {
    if (i++ >= 5) break;
    for (const a of accs) {
      console.log(`   - ${mint.slice(0, 8)}...: ${a.uiAmountString}`);
    }
  }

  // 5. Quote (no taker)
  console.log(`\n📊 Quote: ${SWAP_AMOUNT} lamports SOL → USDC`);
  const quote = await client.order({ inputMint: SOL, outputMint: USDC, amount: SWAP_AMOUNT });
  console.log(`   In:  ${quote.inAmount} ($${quote.inUsdValue?.toFixed(2) ?? "?"})`);
  console.log(`   Out: ${quote.outAmount} ($${quote.outUsdValue?.toFixed(2) ?? "?"})`);
  console.log(`   Router: ${quote.router} | Slippage: ${quote.slippageBps}bps | Fee: ${quote.feeBps}bps`);

  // 6. Order (with taker)
  console.log(`\n📝 Order with taker (${MY_WALLET.slice(0, 8)}...):`);
  const order = await client.order({ inputMint: SOL, outputMint: USDC, amount: SWAP_AMOUNT, taker: MY_WALLET });
  if (order.transaction) {
    console.log(`   ✅ Transaction ready (${order.transaction.length} chars)`);
    console.log(`   Request ID: ${order.requestId}`);
    console.log(`   Gasless: ${order.gasless ? "Yes" : "No"}`);
  } else {
    console.log(`   ❌ No transaction: [${order.errorCode}] ${order.errorMessage}`);
  }
  console.log(`   Gas: sig=${order.signatureFeeLamports} prio=${order.prioritizationFeeLamports} rent=${order.rentFeeLamports}`);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("                         ✅ Done!");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
