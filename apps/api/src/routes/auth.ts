import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "__SCOPE__/core/db";
import { users } from "__SCOPE__/core/db/schema";
import { getAuth } from "../lib/auth";

const app = new Hono();

function buildWalletAddress(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const hash = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 40);
  return `email:${hash}`;
}

async function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers });
}

async function upsertUser(data: {
  authUserId: string;
  email: string;
}) {
  const walletAddress = buildWalletAddress(data.email);

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, data.authUserId))
    .limit(1);

  if (existingUser) {
    await db
      .update(users)
      .set({
        email: data.email,
        wallet: walletAddress,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id));

    return {
      ...existingUser,
      email: data.email,
      wallet: walletAddress,
      updatedAt: new Date(),
    };
  }

  const [newUser] = await db
    .insert(users)
    .values({
      id: data.authUserId,
      email: data.email,
      wallet: walletAddress,
    })
    .returning();

  return newUser;
}

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    walletAddress: user.wallet,
    authUserId: user.id,
    createdAt: user.createdAt,
  };
}

app.post("/sync", async (c) => {
  const session = await getSession(c.req.raw.headers);

  if (!session?.user?.email) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await upsertUser({
    authUserId: session.user.id,
    email: session.user.email,
  });

  return c.json({
    success: true,
    user: formatUser(user),
  });
});

app.get("/me", async (c) => {
  const session = await getSession(c.req.raw.headers);

  if (!session?.user?.email) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const user = await upsertUser({
    authUserId: session.user.id,
    email: session.user.email,
  });

  return c.json({
    user: formatUser(user),
  });
});

app.on(["GET", "POST"], "/*", (c) => {
  return getAuth().handler(c.req.raw);
});

export default app;
