/// <reference path="../sst-env.d.ts" />
/**
 * Script to delete a Bridge customer
 *
 * Usage (run in sst shell):
 *   npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts <customer-id-or-email>
 *
 * Examples:
 *   npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts cust_abc123
 *   npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts user@example.com
 */

import { Resource } from "sst";

const isProd = true;
const BRIDGE_API_URL = isProd
  ? "https://api.bridge.xyz/v0"
  : "https://api.sandbox.bridge.xyz/v0";

async function main() {
  const identifier = process.argv[2];

  if (!identifier) {
    console.error("Usage: npx tsx scripts/delete-bridge-customer.ts <customer-id-or-email>");
    console.error("");
    console.error("Examples:");
    console.error("  npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts cust_abc123");
    console.error("  npx sst shell --stage bat npx tsx scripts/delete-bridge-customer.ts user@example.com");
    process.exit(1);
  }

  const apiKey = Resource.BridgeApiKey.value;
  if (!apiKey) {
    console.error("Error: BridgeApiKey secret not configured");
    console.error("Set it with: npx sst secrets set BridgeApiKey <your-key> --stage <stage>");
    process.exit(1);
  }

  console.log(`Using Bridge ${isProd ? "PRODUCTION" : "SANDBOX"} API`);
  console.log(`Stage: ${process.env.SST_STAGE || "unknown"}`);
  console.log(`Base URL: ${BRIDGE_API_URL}`);
  console.log("");

  const headers = {
    "Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  let customerId = identifier;

  // If identifier looks like an email, search for the customer first
  if (identifier.includes("@")) {
    console.log(`Searching for customer with email: ${identifier}`);

    // First try to find via KYC links
    const kycResponse = await fetch(`${BRIDGE_API_URL}/kyc_links?email=${encodeURIComponent(identifier)}`, {
      headers,
    });

    if (!kycResponse.ok) {
      const error = await kycResponse.text();
      console.error("Failed to search KYC links:", error);
      process.exit(1);
    }

    const kycData = await kycResponse.json() as { data?: Array<{ id: string; kyc_status: string; tos_status: string; customer_id?: string }> };
    console.log(`Found ${kycData.data?.length || 0} KYC link(s)`);

    if (kycData.data && kycData.data.length > 0) {
      console.log("\nKYC Links found:");
      for (const kyc of kycData.data) {
        console.log(`  - ID: ${kyc.id}`);
        console.log(`    KYC Status: ${kyc.kyc_status}`);
        console.log(`    TOS Status: ${kyc.tos_status}`);
        console.log(`    Customer ID: ${kyc.customer_id || "N/A"}`);
        console.log("");
      }

      // Find one with a customer_id
      const withCustomer = kycData.data.find((k) => k.customer_id);
      if (withCustomer && withCustomer.customer_id) {
        customerId = withCustomer.customer_id;
        console.log(`Using customer ID: ${customerId}`);
      } else {
        console.log("⚠️  KYC links found but no customer_id associated yet");
        console.log("   This means the user started KYC but hasn't completed it.");
        console.log("   You can create a new KYC link for this email.");
        process.exit(0);
      }
    } else {
      console.log("No KYC links found for this email");
      process.exit(0);
    }
  }

  // Fetch customer details first
  console.log(`\nFetching customer: ${customerId}`);
  const getResponse = await fetch(`${BRIDGE_API_URL}/customers/${customerId}`, {
    headers,
  });

  if (!getResponse.ok) {
    if (getResponse.status === 404) {
      console.log("Customer not found - may have already been deleted");
      process.exit(0);
    }
    const error = await getResponse.text();
    console.error("Failed to fetch customer:", error);
    process.exit(1);
  }

  const customer = await getResponse.json() as {
    id: string;
    type: string;
    status: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    created_at: string;
  };
  console.log("\nCustomer details:");
  console.log(`  ID: ${customer.id}`);
  console.log(`  Type: ${customer.type}`);
  console.log(`  Status: ${customer.status}`);
  console.log(`  Email: ${customer.email || "N/A"}`);
  console.log(`  Name: ${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "N/A");
  console.log(`  Created: ${customer.created_at}`);

  // Confirm deletion
  console.log("\n⚠️  WARNING: This will permanently delete the customer from Bridge!");
  console.log("Press Ctrl+C to cancel, or wait 3 seconds to proceed...\n");

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Delete the customer
  console.log(`Deleting customer ${customerId}...`);
  const deleteResponse = await fetch(`${BRIDGE_API_URL}/customers/${customerId}`, {
    method: "DELETE",
    headers,
  });

  if (!deleteResponse.ok) {
    const error = await deleteResponse.text();
    console.error("Failed to delete customer:", error);
    process.exit(1);
  }

  console.log("✅ Customer deleted successfully from Bridge!");
  console.log("");
  console.log("Note: You may also want to clean up your local database:");
  console.log(`  DELETE FROM bridge_customers WHERE bridge_customer_id = '${customerId}';`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
