import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { db } from "__SCOPE__/core/db";
import { users } from "__SCOPE__/core/db/schema";
import { getAuth, type BetterAuthUser, type AuthSession } from "../lib/auth";

export type AuthVariables = {
  authUser: BetterAuthUser;
  session: AuthSession["session"];
  userId: string;
  walletAddress: string;
  email: string;
};

async function getDatabaseUser(userId: string) {
  const [dbUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return dbUser ?? null;
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.email) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const dbUser = await getDatabaseUser(session.user.id);

    if (!dbUser) {
      return c.json({ error: "User not found. Call /auth/sync first." }, 401);
    }

    c.set("authUser", session.user);
    c.set("session", session.session);
    c.set("userId", dbUser.id);
    c.set("walletAddress", dbUser.wallet);
    c.set("email", dbUser.email);

    await next();
  }
);

export const authWithWalletMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.email) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const dbUser = await getDatabaseUser(session.user.id);

    if (!dbUser) {
      return c.json({ error: "User not found. Call /auth/sync first." }, 401);
    }

    if (!dbUser.wallet) {
      return c.json({ error: "No wallet linked. Please complete wallet setup." }, 400);
    }

    c.set("authUser", session.user);
    c.set("session", session.session);
    c.set("userId", dbUser.id);
    c.set("walletAddress", dbUser.wallet);
    c.set("email", dbUser.email);

    await next();
  }
);
