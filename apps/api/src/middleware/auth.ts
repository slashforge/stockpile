import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "@soljar/core/db";
import { users } from "@soljar/core/db/schema";
import { getPrivyClient, getEmail, type PrivyUser } from "../lib/privy";

export type AuthVariables = {
  privyUser: PrivyUser;
  userId: string; // Database user ID
  walletAddress: string | null; // From database, may be null
  email: string | null;
};

/**
 * Auth middleware that verifies Privy identity tokens.
 * 
 * Expects the identity token in the `privy-id-token` header.
 * Identity tokens contain user data and are verified using `privy.users().get({ id_token })`.
 * 
 * User data (including wallet address) is fetched from our database,
 * not from Privy - reducing API calls since we already have this data
 * from the /auth/sync call.
 */
export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const idToken = c.req.header("privy-id-token");
    
    if (!idToken) {
      return c.json({ error: "Missing privy-id-token header" }, 401);
    }

    try {
      const privy = getPrivyClient();
      
      // Verify identity token and get user data
      // This verifies the JWT signature AND returns full user data
      const privyUser = await privy.users().get({ id_token: idToken }) as unknown as PrivyUser;
      
      // Look up user in database by ID (Privy user ID is used as database ID)
      // The wallet address is already stored from /auth/sync
      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, privyUser.id))
        .limit(1);
      
      if (!dbUser) {
        return c.json({ error: "User not found. Call /auth/sync first." }, 401);
      }
      
      // Set user data in context - wallet comes from database
      c.set("privyUser", privyUser);
      c.set("userId", dbUser.id);
      c.set("walletAddress", dbUser.smartAccount); // From database, not Privy
      c.set("email", dbUser.email ?? getEmail(privyUser));
      
      await next();
    } catch (error: unknown) {
      console.error("Privy auth error:", error);
      
      const message = error instanceof Error ? error.message : "Invalid or expired token";
      return c.json({ error: message }, 401);
    }
  }
);

/**
 * Auth middleware that requires a wallet address.
 * 
 * Use this for routes that need the wallet (tx, swap, send, etc.)
 * For routes that just need user identity (profile, clients, invoices),
 * use authMiddleware instead.
 */
export const authWithWalletMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const idToken = c.req.header("privy-id-token");
    
    if (!idToken) {
      return c.json({ error: "Missing privy-id-token header" }, 401);
    }

    try {
      const privy = getPrivyClient();
      
      // Verify identity token
      const privyUser = await privy.users().get({ id_token: idToken }) as unknown as PrivyUser;
      
      // Look up user in database
      const [dbUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, privyUser.id))
        .limit(1);
      
      if (!dbUser) {
        return c.json({ error: "User not found. Call /auth/sync first." }, 401);
      }
      
      // Require wallet for these routes
      if (!dbUser.smartAccount) {
        return c.json({ error: "No wallet linked. Please complete wallet setup." }, 400);
      }
      
      c.set("privyUser", privyUser);
      c.set("userId", dbUser.id);
      c.set("walletAddress", dbUser.smartAccount);
      c.set("email", dbUser.email ?? getEmail(privyUser));
      
      await next();
    } catch (error: unknown) {
      console.error("Privy auth error:", error);
      
      const message = error instanceof Error ? error.message : "Invalid or expired token";
      return c.json({ error: message }, 401);
    }
  }
);
