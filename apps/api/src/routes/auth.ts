import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { db } from "@stockpile/core/db";
import { users } from "@stockpile/core/db/schema";
import { getAuth } from "../lib/auth";
import { ErrorSchema, MeResponseSchema, SyncResponseSchema } from "../schemas";

const app = new OpenAPIHono();

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
    createdAt: user.createdAt instanceof Date
      ? user.createdAt.toISOString()
      : String(user.createdAt),
  };
}

const syncRoute = createRoute({
  method: "post",
  path: "/sync",
  operationId: "syncUser",
  tags: ["auth"],
  responses: {
    200: {
      content: { "application/json": { schema: SyncResponseSchema } },
      description: "User synced with the backend",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not authenticated",
    },
  },
});

app.openapi(syncRoute, async (c) => {
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
  }, 200);
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  operationId: "getMe",
  tags: ["auth"],
  responses: {
    200: {
      content: { "application/json": { schema: MeResponseSchema } },
      description: "Current authenticated user",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not authenticated",
    },
  },
});

app.openapi(meRoute, async (c) => {
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
  }, 200);
});

app.on(["GET", "POST"], "/*", (c) => {
  return getAuth().handler(c.req.raw);
});

export default app;
