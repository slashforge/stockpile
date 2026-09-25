import { and, eq } from "drizzle-orm";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { db } from "@stockpile/core/db";
import { savedBags } from "@stockpile/core/db/schema";
import { findBag } from "../lib/bags";
import { syncUser, verifyIdentity, type Identity } from "../lib/identity";
import { readPortfolio, unavailablePortfolio } from "../lib/portfolio";
import { cursorPattern, HELIUS_MAX_LIMIT, readActivity } from "../lib/activity";
import { prepareBag, quoteBag, toQuoteLeg, type TradeError } from "../lib/trade";
import { ActivityResponseSchema, ErrorSchema, MeResponseSchema, PortfolioSchema, SaveBagRequestSchema, SavedSchema, TradeRequestSchema, QuoteSchema, PrepareSchema } from "../schemas";

export type Variables = { identity: Identity };
export const app = new OpenAPIHono<{ Variables: Variables }>();
const response = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

const requireIdentity = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const token = c.req.header("privy-id-token");
  if (!token) return c.json({ error: "Missing privy-id-token header" }, 401);
  if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) return c.json({ error: "Privy is not configured" }, 503);
  const identity = await verifyIdentity(token);
  if (!identity) return c.json({ error: "Invalid or expired credentials" }, 401);
  c.set("identity", identity);
  await next();
});
for (const path of ["/me", "/saved-bags", "/saved-bags/*", "/portfolio", "/activity", "/trade/*"]) app.use(path, requireIdentity);

async function listIds(userId: string) {
  const rows = await db.select({ bagId: savedBags.bagId }).from(savedBags).where(eq(savedBags.userId, userId));
  return rows.map((row) => row.bagId);
}

app.openapi(createRoute({ method: "get", path: "/me", operationId: "getMe", tags: ["account"], responses: { 200: response(MeResponseSchema, "Authenticated profile"), 401: response(ErrorSchema, "Unauthorized"), 503: response(ErrorSchema, "Provider not configured") } }), async (c) => c.json({ user: await syncUser(c.get("identity")) }, 200));
app.openapi(createRoute({ method: "get", path: "/saved-bags", operationId: "listSavedBags", tags: ["account"], responses: { 200: response(SavedSchema, "Saved bag IDs"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => c.json({ bagIds: await listIds(c.get("identity").id) }, 200));
app.openapi(createRoute({ method: "post", path: "/saved-bags", operationId: "saveBag", tags: ["account"], request: { body: { content: { "application/json": { schema: SaveBagRequestSchema } } } }, responses: { 200: response(SavedSchema, "Saved bag IDs"), 404: response(ErrorSchema, "Bag not found"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const bagId = c.req.valid("json").bagId;
  if (!findBag(bagId)) return c.json({ error: "Bag not found" }, 404);
  const identity = c.get("identity");
  await syncUser(identity);
  await db.insert(savedBags).values({ userId: identity.id, bagId }).onConflictDoNothing();
  return c.json({ bagIds: await listIds(identity.id) }, 200);
});
app.openapi(createRoute({ method: "delete", path: "/saved-bags/{bagId}", operationId: "removeSavedBag", tags: ["account"], request: { params: z.object({ bagId: z.string() }) }, responses: { 200: response(SavedSchema, "Saved bag IDs"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const userId = c.get("identity").id;
  await db.delete(savedBags).where(and(eq(savedBags.userId, userId), eq(savedBags.bagId, c.req.valid("param").bagId)));
  return c.json({ bagIds: await listIds(userId) }, 200);
});
app.openapi(createRoute({ method: "get", path: "/portfolio", operationId: "getPortfolio", tags: ["account"], responses: { 200: response(PortfolioSchema, "Verified live balances and holdings, or explicitly unavailable"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const walletAddress = c.get("identity").walletAddress;
  if (!walletAddress) return c.json({ walletAddress, ...unavailablePortfolio("No verified Solana wallet linked to this Privy identity") }, 200);
  return c.json({ walletAddress, ...await readPortfolio(walletAddress) }, 200);
});
const activityQuery = z.object({ cursor: z.string().regex(cursorPattern).optional(), limit: z.coerce.number().int().min(1).max(HELIUS_MAX_LIMIT).optional() });
app.openapi(createRoute({ method: "get", path: "/activity", operationId: "listActivity", tags: ["account"], request: { query: activityQuery }, responses: { 200: response(ActivityResponseSchema, "Parsed wallet history (newest first), or unavailable with a typed error"), 400: response(ErrorSchema, "Invalid cursor or limit"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const { cursor, limit = 20 } = c.req.valid("query");
  const walletAddress = c.get("identity").walletAddress;
  const result = await readActivity(walletAddress, cursor, limit);
  if (!result.ok && result.error.code === "INVALID_CURSOR") return c.json({ error: result.error.message }, 400);
  if (!result.ok) return c.json({ status: "unavailable" as const, walletAddress, items: [], nextCursor: null, asOf: null, error: result.error, message: result.error.message }, 200);
  return c.json({ status: "live" as const, walletAddress, ...result.value, error: null, message: null }, 200);
});

const tradeResponses = { 401: response(ErrorSchema, "Unauthorized"), 404: response(ErrorSchema, "Bag not found") };
app.openapi(createRoute({ method: "post", path: "/trade/quote", operationId: "quoteBagTrade", tags: ["trade"], request: { body: { content: { "application/json": { schema: TradeRequestSchema } } } }, responses: { 200: response(QuoteSchema, "Indicative Jupiter quote per leg, or unavailable with a typed error"), ...tradeResponses } }), async (c) => {
  const request = c.req.valid("json");
  if (!findBag(request.bagId)) return c.json({ error: "Bag not found" }, 404);
  const echo = { bagId: request.bagId, inputMint: request.inputMint, amount: request.amount, slippageBps: request.slippageBps };
  const result = await quoteBag(request);
  if (!result.ok) return c.json({ status: "unavailable" as const, ...echo, legs: [], error: result.error, message: result.error.message }, 200);
  return c.json({ status: "available" as const, ...echo, legs: result.value.legs.map((leg, i) => toQuoteLeg(leg, result.value.quotes[i]!)), error: null, message: "Indicative quote only; routes and output amounts can change before you sign." }, 200);
});

app.openapi(createRoute({ method: "post", path: "/trade/prepare", operationId: "prepareBagTrade", tags: ["trade"], request: { body: { content: { "application/json": { schema: TradeRequestSchema } } } }, responses: { 200: response(PrepareSchema, "Unsigned per-leg transactions, or unavailable with a typed error"), ...tradeResponses } }), async (c) => {
  const request = c.req.valid("json");
  if (!findBag(request.bagId)) return c.json({ error: "Bag not found" }, 404);
  const walletAddress = c.get("identity").walletAddress;
  const echo = { bagId: request.bagId, inputMint: request.inputMint, amount: request.amount, slippageBps: request.slippageBps, walletAddress };
  const unavailable = (error: TradeError) => c.json({ status: "unavailable" as const, ...echo, transactions: [], error, message: error.message }, 200);
  if (!walletAddress) return unavailable({ code: "NO_WALLET", message: "No verified Solana wallet linked to this Privy identity", legIndex: null, symbol: null });
  const result = await prepareBag(request, walletAddress);
  if (!result.ok) return unavailable(result.error);
  return c.json({ status: "ready" as const, ...echo, transactions: result.value, error: null, message: "Unsigned transactions only. Review and sign each leg in your wallet; quotes can expire and fills are not guaranteed." }, 200);
});
export default app;
