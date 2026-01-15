import { PrivyClient } from "@privy-io/node";
import { Resource } from "sst";

let clientInstance: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!clientInstance) {
    const appId = Resource.PrivyAppId.value;
    const appSecret = Resource.PrivyAppSecret.value;

    if (!appId) throw new Error("PrivyAppId secret not configured");
    if (!appSecret) throw new Error("PrivyAppSecret secret not configured");

    clientInstance = new PrivyClient({
      appId,
      appSecret,
    });
  }
  return clientInstance;
}

// Wallet type from Privy wallets API
export interface PrivyWallet {
  id: string;
  address: string;
  chain_type: string;
  owner_id: string | null;
  policy_ids: string[];
  additional_signers: string[];
  created_at: number;
}

// Get user's wallets from the wallets API
export async function getUserWallets(userId: string): Promise<PrivyWallet[]> {
  const privy = getPrivyClient();
  
  try {
    // Use the wallets API with user_id filter
    const response = await privy.wallets().list({ user_id: userId });
    const wallets: PrivyWallet[] = [];
    
    // Collect all wallets from the paginated response
    for await (const wallet of response) {
      wallets.push(wallet as unknown as PrivyWallet);
    }
    
    console.log(`Found ${wallets.length} wallets for user ${userId}:`, 
      wallets.map(w => ({ id: w.id, address: w.address?.slice(0, 8) + "...", chain_type: w.chain_type }))
    );
    
    return wallets;
  } catch (error) {
    console.error("Error fetching user wallets:", error);
    return [];
  }
}

// Get user's Solana wallet address from wallets API
export async function getUserSolanaWallet(userId: string): Promise<string | null> {
  const wallets = await getUserWallets(userId);
  const solanaWallet = wallets.find(w => w.chain_type === "solana");
  return solanaWallet?.address ?? null;
}

// Type for Privy linked account (covers all wallet types)
export interface PrivyLinkedAccount {
  type: string;
  address?: string;
  chain_type?: string;
  connector_type?: string; // "embedded" for embedded wallets
  wallet_client_type?: string;
  wallet_client?: string;
  public_key?: string;
  verified_at?: number;
  id?: string | null;
}

export interface PrivyUser {
  id: string;
  linked_accounts: PrivyLinkedAccount[];
  custom_metadata?: Record<string, unknown>;
  created_at?: number;
}

// Helper to extract Solana wallet from Privy user's linked_accounts
// Note: Embedded wallets may not appear in linked_accounts - use getUserSolanaWallet() instead
export function getSolanaWallet(user: PrivyUser): string | null {
  // Find Solana wallet in linked_accounts
  // External wallets: type="wallet", chain_type="solana"
  // Some embedded wallets may also appear here
  const solanaWallet = user.linked_accounts.find(
    (a) => a.type === "wallet" && a.chain_type === "solana"
  );
  
  if (solanaWallet?.address) {
    return solanaWallet.address;
  }

  // Fallback: Check for any account with a Solana-like address (base58, 32-44 chars)
  for (const account of user.linked_accounts) {
    if (account.address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(account.address)) {
      return account.address;
    }
  }

  return null;
}

// Helper to extract email from Privy user
export function getEmail(user: PrivyUser): string | null {
  const email = user.linked_accounts.find((a) => a.type === "email");
  return email?.address ?? null;
}
