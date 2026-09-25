import { secret } from "../lib/config";
import { and, eq } from "drizzle-orm";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createMiddleware } from "hono/factory";
import { db } from "@stockpile/core/db";
import { savedBags } from "@stockpile/core/db/schema";
import { findBag } from "../lib/bags";
import { syncUser, verifyIdentity, type Identity } from "../lib/identity";
import { readPortfolio, unavailablePortfolio } from "../lib/portfolio";
import { cursorPattern, HELIUS_MAX_LIMIT, readActivity } from "../lib/activity";
import { applyBagLinks, readPositions, recordLeg } from "../lib/positions";
import { prepareBag, prepareTokenSell, quoteBag, quoteTokenSell, toQuoteLeg, tradeSide, type TokenSellRequest, type TradeError, type TradeRequest } from "../lib/trade";
import { readStatuses, submitSigned } from "../lib/broadcast";
import { ActivityResponseSchema, BagLotResponseSchema, ErrorSchema, LegErrorSchema, MeResponseSchema, PendingLegSchema, PortfolioSchema, PositionsResponseSchema, RecordBagLegRequestSchema, SaveBagRequestSchema, SavedSchema, TradeRequestSchema, QuoteSchema, PrepareSchema, SubmitTransactionRequestSchema, SubmitTransactionSchema, TokenSellPrepareSchema, TokenSellQuoteSchema, TokenSellRequestSchema, TransactionStatusRequestSchema, TransactionStatusesSchema } from "../schemas";

export type Variables = { identity: Identity };
export const app = new OpenAPIHono<{ Variables: Variables }>();
const response = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });

const requireIdentity = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const token = c.req.header("privy-id-token");
  if (!token) return c.json({ error: "Missing privy-id-token header" }, 401);
  if (!secret("PrivyAppId") || !secret("PrivyAppSecret")) return c.json({ error: "Privy is not configured" }, 503);
  const identity = await verifyIdentity(token);
  if (!identity) return c.json({ error: "Invalid or expired credentials" }, 401);
  c.set("identity", identity);
  await next();
});
for (const path of ["/me", "/saved-bags", "/saved-bags/*", "/portfolio", "/activity", "/trade/*", "/positions", "/positions/*"]) app.use(path, requireIdentity);

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
  const identity = c.get("identity");
  const walletAddress = identity.walletAddress;
  const result = await readActivity(walletAddress, cursor, limit);
  if (!result.ok && result.error.code === "INVALID_CURSOR") return c.json({ error: result.error.message }, 400);
  if (!result.ok) return c.json({ status: "unavailable" as const, walletAddress, items: [], nextCursor: null, asOf: null, error: result.error, message: result.error.message }, 200);
  const page = await applyBagLinks(result.value, identity.id).catch(() => result.value);
  return c.json({ status: "live" as const, walletAddress, ...page, error: null, message: null }, 200);
});

app.openapi(createRoute({ method: "get", path: "/positions", operationId: "getBagPositions", tags: ["positions"], responses: { 200: response(PositionsResponseSchema, "Per-bag positions from the user's recorded lots, reconciled against live wallet balances and priced; explicitly unavailable when balances cannot be read"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => c.json(await readPositions(c.get("identity")), 200));
app.openapi(createRoute({ method: "post", path: "/positions/legs", operationId: "recordBagLeg", tags: ["positions"], request: { body: { content: { "application/json": { schema: RecordBagLegRequestSchema } } } }, responses: {
  200: response(BagLotResponseSchema, "The confirmed swap leg linked to the bag (amounts derived from the chain, side inferred); idempotent for the same signature and bag"),
  202: response(PendingLegSchema, "Transaction not yet visible on-chain; retry shortly"), 400: response(LegErrorSchema, "Not your transaction, not a USDC<->asset swap, mint not in the bag, or the transaction failed"),
  401: response(ErrorSchema, "Unauthorized"), 404: response(ErrorSchema, "Bag not found"), 409: response(LegErrorSchema, "Signature already linked to a different bag"), 503: response(LegErrorSchema, "Transaction provider not configured or unavailable") } }), async (c) => {
  const { bagId, signature } = c.req.valid("json");
  const identity = c.get("identity");
  await syncUser(identity);
  const result = await recordLeg(identity, bagId, signature);
  switch (result.status) {
    case 200: return c.json({ lot: result.lot }, 200);
    case 202: return c.json({ status: "pending" as const, message: "Transaction not confirmed yet; retry in a few seconds" }, 202);
    case 404: return c.json({ error: result.error }, 404);
    case 409: return c.json({ error: result.error, code: result.code, bagId: result.bagId }, 409);
    case 503: return c.json({ error: result.error, code: result.code }, 503);
    default: return c.json({ error: result.error, code: result.code }, 400);
  }
});

const tradeResponses = { 401: response(ErrorSchema, "Unauthorized"), 404: response(ErrorSchema, "Bag not found") };
const echoOf = (request: TradeRequest) => ({ bagId: request.bagId, side: tradeSide(request), inputMint: tradeSide(request) === "buy" ? request.inputMint ?? null : null, amount: tradeSide(request) === "buy" ? request.amount ?? null : null, portionBps: tradeSide(request) === "sell" ? request.portionBps ?? null : null, slippageBps: request.slippageBps ?? null });
const totalOut = (side: "buy" | "sell", legs: { outAmount: string }[]) => (side === "sell" ? legs.reduce((sum, leg) => sum + BigInt(leg.outAmount), 0n).toString() : null);
app.openapi(createRoute({ method: "post", path: "/trade/quote", operationId: "quoteBagTrade", tags: ["trade"], request: { body: { content: { "application/json": { schema: TradeRequestSchema } } } }, responses: { 200: response(QuoteSchema, "Indicative Jupiter quote per leg, or unavailable with a typed error"), ...tradeResponses } }), async (c) => {
  const request = c.req.valid("json");
  if (!findBag(request.bagId)) return c.json({ error: "Bag not found" }, 404);
  const echo = echoOf(request);
  const identity = c.get("identity");
  const result = await quoteBag(request, { userId: identity.id, walletAddress: identity.walletAddress });
  if (!result.ok) return c.json({ status: "unavailable" as const, ...echo, totalOutAmount: null, legs: [], error: result.error, message: result.error.message }, 200);
  const legs = result.value.legs.map((leg, i) => toQuoteLeg(leg, result.value.quotes[i]!));
  return c.json({ status: "available" as const, ...echo, totalOutAmount: totalOut(echo.side, legs), legs, error: null, message: "Indicative quote only; routes and output amounts can change before you sign." }, 200);
});

app.openapi(createRoute({ method: "post", path: "/trade/prepare", operationId: "prepareBagTrade", tags: ["trade"], request: { body: { content: { "application/json": { schema: TradeRequestSchema } } } }, responses: { 200: response(PrepareSchema, "Unsigned per-leg transactions, or unavailable with a typed error"), ...tradeResponses } }), async (c) => {
  const request = c.req.valid("json");
  if (!findBag(request.bagId)) return c.json({ error: "Bag not found" }, 404);
  const identity = c.get("identity");
  const walletAddress = identity.walletAddress;
  const echo = { ...echoOf(request), walletAddress };
  const unavailable = (error: TradeError) => c.json({ status: "unavailable" as const, ...echo, totalOutAmount: null, transactions: [], error, message: error.message }, 200);
  if (!walletAddress) return unavailable({ code: "NO_WALLET", message: "No verified Solana wallet linked to this Privy identity", legIndex: null, symbol: null });
  const result = await prepareBag(request, walletAddress, { userId: identity.id, walletAddress });
  if (!result.ok) return unavailable(result.error);
  return c.json({ status: "ready" as const, ...echo, totalOutAmount: totalOut(echo.side, result.value), transactions: result.value, error: null, message: "Unsigned transactions only. Review and sign each leg in your wallet; quotes can expire and fills are not guaranteed." }, 200);
});

app.openapi(createRoute({ method: "post", path: "/trade/submit", operationId: "submitTransaction", tags: ["trade"], request: { body: { content: { "application/json": { schema: SubmitTransactionRequestSchema } } } }, responses: {
  200: response(SubmitTransactionSchema, "Broadcast through Stockpile's RPC; confirm with /trade/status"), 400: response(ErrorSchema, "Not signed by your wallet, or rejected by preflight simulation"),
  401: response(ErrorSchema, "Unauthorized"), 503: response(ErrorSchema, "Transaction provider not configured or unavailable") } }), async (c) => {
  const identity = c.get("identity");
  const walletAddress = identity.walletAddress;
  if (!walletAddress) return c.json({ error: "No verified Solana wallet linked to this Privy identity" }, 400);
  const { transaction, bagId } = c.req.valid("json");
  const result = await submitSigned(transaction, walletAddress);
  if (!result.ok) return result.status === 503 ? c.json({ error: result.error }, 503) : c.json({ error: result.error }, 400);
  if (bagId) {
    const task = linkWhenConfirmed(identity, bagId, result.signature);
    // Workers keep the isolate alive for it; under Bun it simply runs on after the response.
    try { c.executionCtx.waitUntil(task); } catch { /* no execution context outside Workers */ }
  }
  return c.json({ signature: result.signature }, 200);
});

const tokenEchoOf = (request: TokenSellRequest) => ({ mints: request.mints, portionBps: request.portionBps, slippageBps: request.slippageBps ?? null });
app.openapi(createRoute({ method: "post", path: "/trade/tokens/quote", operationId: "quoteTokenSell", tags: ["trade"], request: { body: { content: { "application/json": { schema: TokenSellRequestSchema } } } }, responses: { 200: response(TokenSellQuoteSchema, "Indicative quote per token -> USDC leg, sized from balances held outside every bag, or unavailable with a typed error"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const request = c.req.valid("json");
  const identity = c.get("identity");
  const echo = tokenEchoOf(request);
  const result = await quoteTokenSell(request, { userId: identity.id, walletAddress: identity.walletAddress });
  if (!result.ok) return c.json({ status: "unavailable" as const, ...echo, totalOutAmount: null, legs: [], error: result.error, message: result.error.message }, 200);
  const legs = result.value.legs.map((leg, i) => toQuoteLeg(leg, result.value.quotes[i]!));
  return c.json({ status: "available" as const, ...echo, totalOutAmount: totalOut("sell", legs), legs, error: null, message: "Indicative quote only; routes and output amounts can change before you sign." }, 200);
});

app.openapi(createRoute({ method: "post", path: "/trade/tokens/prepare", operationId: "prepareTokenSell", tags: ["trade"], request: { body: { content: { "application/json": { schema: TokenSellRequestSchema } } } }, responses: { 200: response(TokenSellPrepareSchema, "Unsigned sponsored token -> USDC transactions, or unavailable with a typed error"), 401: response(ErrorSchema, "Unauthorized") } }), async (c) => {
  const request = c.req.valid("json");
  const identity = c.get("identity");
  const walletAddress = identity.walletAddress;
  const echo = { ...tokenEchoOf(request), walletAddress };
  const unavailable = (error: TradeError) => c.json({ status: "unavailable" as const, ...echo, totalOutAmount: null, transactions: [], error, message: error.message }, 200);
  if (!walletAddress) return unavailable({ code: "NO_WALLET", message: "No verified Solana wallet linked to this Privy identity", legIndex: null, symbol: null });
  const result = await prepareTokenSell(request, walletAddress, { userId: identity.id, walletAddress });
  if (!result.ok) return unavailable(result.error);
  return c.json({ status: "ready" as const, ...echo, totalOutAmount: totalOut("sell", result.value), transactions: result.value, error: null, message: "Unsigned transactions only. Review and sign each leg in your wallet; quotes can expire and fills are not guaranteed." }, 200);
});

const LINK_DELAYS_MS = [1_500, 2_500, 4_000, 6_000, 8_000, 8_000];
/** Server-side twin of the app's lot recorder, so a leg still links if the app is closed or reloaded mid-confirmation. */
async function linkWhenConfirmed(identity: Identity, bagId: string, signature: string) {
  try {
    await syncUser(identity);
    for (const delay of LINK_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const result = await recordLeg(identity, bagId, signature).catch(() => null);
      if (result && result.status !== 202 && result.status !== 503) return;
    }
  } catch (error) {
    console.warn("background leg link failed", signature, error);
  }
}

app.openapi(createRoute({ method: "post", path: "/trade/status", operationId: "getTransactionStatuses", tags: ["trade"], request: { body: { content: { "application/json": { schema: TransactionStatusRequestSchema } } } }, responses: {
  200: response(TransactionStatusesSchema, "Status per signature, in request order"), 401: response(ErrorSchema, "Unauthorized"), 503: response(ErrorSchema, "Transaction provider not configured or unavailable") } }), async (c) => {
  const result = await readStatuses(c.req.valid("json").signatures);
  if (!result.ok) return c.json({ error: result.error }, 503);
  return c.json({ statuses: result.statuses }, 200);
});
export default app;
