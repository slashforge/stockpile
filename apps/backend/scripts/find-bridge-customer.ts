/// <reference path="../sst-env.d.ts" />
/**
 * Quick script to find Bridge customer/KYC link by email
 *
 * Usage: npx sst shell --stage bat npx tsx scripts/find-bridge-customer.ts your@email.com
 */

import { Resource } from "sst";

const isSandbox = process.env.BRIDGE_SANDBOX_MODE === "true";
const BRIDGE_API_URL = isSandbox
  ? "https://api.sandbox.bridge.xyz/v0"
  : "https://api.bridge.xyz/v0";

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npx tsx scripts/find-bridge-customer.ts <email>");
    process.exit(1);
  }

  const apiKey = Resource.BridgeApiKey.value;
  console.log(`Searching for: ${email}`);
  console.log(`Using: ${BRIDGE_API_URL}\n`);

  const response = await fetch(`${BRIDGE_API_URL}/kyc_links?email=${encodeURIComponent(email)}`, {
    headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
  });

  const data = await response.json() as { data?: Array<{ id: string; customer_id?: string; kyc_status: string; tos_status: string }> };

  if (!data.data?.length) {
    console.log("No KYC links found for this email");
    process.exit(0);
  }

  console.log("Found KYC links:\n");
  for (const kyc of data.data) {
    console.log(`  KYC Link ID: ${kyc.id}`);
    console.log(`  Customer ID: ${kyc.customer_id || "N/A"}`);
    console.log(`  KYC Status: ${kyc.kyc_status}`);
    console.log(`  TOS Status: ${kyc.tos_status}`);
    console.log("");
  }

  const withCustomer = data.data.find(k => k.customer_id);
  if (withCustomer) {
    console.log(`\nTo delete: npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts ${withCustomer.customer_id}`);
  }
}

main().catch(console.error);
