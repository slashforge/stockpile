import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@soljar/core/db";
import { users } from "@soljar/core/db/schema";
import { getPrivyClient, getSolanaWallet, getEmail, getUserSolanaWallet, type PrivyUser } from "../lib/privy";

const app = new Hono();

/**
 * Sync user to database after Privy login.
 * 
 * This endpoint is called after successful Privy authentication on the client.
 * It verifies the identity token and creates/updates the user in our database.
 * 
 * Request headers:
 *   - privy-id-token: The identity token from Privy SDK
 * 
 * Note: We use the existing schema columns:
 *   - gridUserId stores the Privy user ID
 *   - smartAccount stores the wallet address
 */
app.post("/sync", async (c) => {
  const idToken = c.req.header("privy-id-token");

  if (!idToken) {
    return c.json({ error: "Missing privy-id-token header" }, 401);
  }

  try {
    const privy = getPrivyClient();

    // Verify identity token and get user data
    const privyUser = await privy.users().get({ id_token: idToken }) as unknown as PrivyUser;

    console.log("Privy user ID:", privyUser.id);

    // Extract email from linked accounts
    const email = getEmail(privyUser);
    console.log("Extracted email:", email);

    if (!email) {
      return c.json({ error: "No email linked to this account" }, 400);
    }

    // First try linked_accounts (for external wallets)
    let walletAddress = getSolanaWallet(privyUser);
    
    // If not in linked_accounts, query the wallets API (for embedded wallets)
    if (!walletAddress) {
      console.log("No wallet in linked_accounts, checking wallets API...");
      walletAddress = await getUserSolanaWallet(privyUser.id);
    }

    console.log("Final wallet address:", walletAddress);

    if (!walletAddress) {
      return c.json({ 
        error: "No Solana wallet found. Please ensure wallet creation is complete.",
        debug: {
          userId: privyUser.id,
          linkedAccountTypes: privyUser.linked_accounts.map(a => ({ type: a.type, chain_type: a.chain_type }))
        }
      }, 400);
    }

    // Upsert user in database
    const user = await upsertUser({
      privyUserId: privyUser.id,
      email,
      walletAddress,
    });

    console.log("User synced:", {
      id: user.id,
      privyUserId: privyUser.id,
      email,
      walletAddress,
    });

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.smartAccount,
        privyUserId: user.gridUserId, // gridUserId stores Privy user ID
      },
    });
  } catch (error: unknown) {
    console.error("Auth sync error:", error);
    const message = error instanceof Error ? error.message : "Authentication failed";
    return c.json({ error: message }, 401);
  }
});

/**
 * Get current user info.
 * 
 * Verifies the identity token and returns user data from our database.
 */
app.get("/me", async (c) => {
  const idToken = c.req.header("privy-id-token");

  if (!idToken) {
    return c.json({ error: "Missing privy-id-token header" }, 401);
  }

  try {
    const privy = getPrivyClient();

    // Verify identity token
    const privyUser = await privy.users().get({ id_token: idToken }) as unknown as PrivyUser;

    // Find user in database (Privy user ID is used as database ID)
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, privyUser.id))
      .limit(1);

    if (user.length === 0) {
      return c.json({ error: "User not found. Call /auth/sync first." }, 404);
    }

    return c.json({
      user: {
        id: user[0].id,
        email: user[0].email,
        walletAddress: user[0].smartAccount,
        privyUserId: user[0].gridUserId,
        createdAt: user[0].createdAt,
      },
    });
  } catch (error: unknown) {
    console.error("Auth me error:", error);
    const message = error instanceof Error ? error.message : "Authentication failed";
    return c.json({ error: message }, 401);
  }
});

/**
 * Upsert user in database.
 * 
 * Creates a new user or updates existing one based on Privy user ID.
 * Uses existing schema columns:
 *   - gridUserId stores Privy user ID
 *   - smartAccount stores wallet address
 */
async function upsertUser(data: {
  privyUserId: string;
  email: string;
  walletAddress: string;
}) {
  // Try to find existing user by ID (Privy user ID is used as database ID)
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, data.privyUserId))
    .limit(1);

  if (existing.length > 0) {
    // Update existing user
    await db
      .update(users)
      .set({
        email: data.email,
        smartAccount: data.walletAddress,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));

    return {
      ...existing[0],
      email: data.email,
      smartAccount: data.walletAddress,
    };
  }

  // Create new user - use Privy user ID as the database ID
  const [newUser] = await db
    .insert(users)
    .values({
      id: data.privyUserId, // Use Privy user ID as database ID
      email: data.email,
      gridUserId: data.privyUserId, // Also store in gridUserId for backward compatibility
      smartAccount: data.walletAddress, // Store wallet address in smartAccount column
    })
    .returning();

  return newUser;
}

export default app;
