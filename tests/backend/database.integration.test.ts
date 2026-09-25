import { describe, expect, it, mock } from "bun:test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const id = `stockpile-test-${randomUUID()}`;
mock.module("../../apps/api/src/lib/identity", () => ({
  verifyIdentity: async (token: string) => token === "local-test-token" ? { id, email: null, walletAddress: null } : null,
  syncUser: async (identity: { id: string; email: string | null; walletAddress: string | null }) => {
    const { db } = await import("@stockpile/core/db");
    const { users } = await import("@stockpile/core/db/schema");
    const [user] = await db.insert(users).values({ id: identity.id, email: identity.email, wallet: identity.walletAddress }).onConflictDoUpdate({ target: users.id, set: { email: identity.email, wallet: identity.walletAddress } }).returning();
    return { id: user!.id, email: user!.email, walletAddress: user!.wallet, createdAt: user!.createdAt.toISOString() };
  },
}));
const { app } = await import("../../apps/api/src/app");
const headers = { "privy-id-token": "local-test-token" };

describe("local Postgres persistence through Hono (mocked Privy identity only)", () => {
  it("writes profile and saves scoped to verified identity, then removes its own test rows", async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for local persistence test");
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    const previousApp = process.env.PRIVY_APP_ID;
    const previousSecret = process.env.PRIVY_APP_SECRET;
    process.env.PRIVY_APP_ID = "local-test";
    process.env.PRIVY_APP_SECRET = "local-test";
    try {
      const me = await app.request("/me", { headers });
      expect(me.status).toBe(200);
      expect((await me.json() as { user: { id: string } }).user.id).toBe(id);
      const saved = await app.request("/saved-bags", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ bagId: "megacap-builders" }) });
      expect(saved.status).toBe(200);
      expect((await saved.json() as { bagIds: string[] }).bagIds).toEqual(["megacap-builders"]);
      expect((await db.query("SELECT bag_id FROM saved_bags WHERE user_id=$1", [id])).rows).toEqual([{ bag_id: "megacap-builders" }]);
      const removed = await app.request("/saved-bags/megacap-builders", { method: "DELETE", headers });
      expect(removed.status).toBe(200);
      expect((await removed.json() as { bagIds: string[] }).bagIds).toEqual([]);
    } finally {
      await db.query("DELETE FROM users WHERE id=$1", [id]);
      await db.end();
      if (previousApp === undefined) delete process.env.PRIVY_APP_ID; else process.env.PRIVY_APP_ID = previousApp;
      if (previousSecret === undefined) delete process.env.PRIVY_APP_SECRET; else process.env.PRIVY_APP_SECRET = previousSecret;
    }
  });
});
