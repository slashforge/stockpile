import { describe, expect, it, mock } from "bun:test";
import { resetConfig, setSecrets } from "../../apps/api/src/lib/config";
import { Client } from "pg";
import { Resource } from "sst";
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
    // Run with `sst shell -- bun test tests/backend` so the DatabaseUrl secret is linked.
    const db = new Client({ connectionString: Resource.DatabaseUrl.value });
    await db.connect();
    setSecrets({ PrivyAppId: "local-test", PrivyAppSecret: "local-test" });
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
      resetConfig();
    }
  });
});
