import { PrivyClient } from "@privy-io/node";
import { db } from "@stockpile/core/db";
import { users } from "@stockpile/core/db/schema";

export type Identity = { id: string; email: string | null; walletAddress: string | null };
let client: PrivyClient | undefined;

export async function verifyIdentity(token: string): Promise<Identity | null> {
  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) throw new Error("Privy is not configured");
  client ??= new PrivyClient({ appId: process.env.PRIVY_APP_ID, appSecret: process.env.PRIVY_APP_SECRET });
  try {
    // Privy verifies the identity token before returning the linked accounts.
    const user = await client.users().get({ id_token: token });
    const accounts = user.linked_accounts ?? [];
    const email = accounts.find((account) => account.type === "email") as { address?: string } | undefined;
    const wallet = accounts.find((account) => account.type === "wallet" && "chain_type" in account && account.chain_type === "solana") as { address?: string } | undefined;
    return { id: user.id, email: email?.address ?? null, walletAddress: wallet?.address ?? null };
  } catch {
    return null;
  }
}

export async function syncUser(identity: Identity) {
  const [user] = await db.insert(users).values({ id: identity.id, email: identity.email, wallet: identity.walletAddress })
    .onConflictDoUpdate({ target: users.id, set: { email: identity.email, wallet: identity.walletAddress, updatedAt: new Date() } }).returning();
  return { id: user!.id, email: user!.email, walletAddress: user!.wallet, createdAt: user!.createdAt.toISOString() };
}
