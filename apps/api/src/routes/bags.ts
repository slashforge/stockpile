import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { bags, knownSymbol, findBag, publicBag } from "../lib/bags";
import { assetChart, bagChart, bagReturns, sparklines } from "../lib/charts";
import { base58Mint } from "../lib/constants";
import { bagHistory } from "../lib/history";
import { AssetChartSchema, BagChartSchema, BagResponseSchema, BagReturnsResponseSchema, BagsSchema, ChartRangeSchema, ErrorSchema, HistoryRangeSchema, HistorySchema, SparklinesSchema } from "../schemas";

const app = new OpenAPIHono();
app.openapi(createRoute({ method: "get", path: "/", operationId: "listBags", tags: ["bags"], responses: { 200: { description: "Editorial bags", content: { "application/json": { schema: BagsSchema } } } } }), async (c) => c.json({ bags: await Promise.all(bags.map(publicBag)) }, 200));
// Static paths before `/{id}` so "sparklines" / "returns" are never treated as bag ids.
app.openapi(createRoute({ method: "get", path: "/returns", operationId: "getBagReturns", tags: ["bags"], responses: { 200: { description: "1M / 1Y / ALL bag-index returns (%) and a 30-day daily sparkline per bag, from one daily tokens.xyz series per mint; nulls when a window is not fully covered", content: { "application/json": { schema: BagReturnsResponseSchema } } } } }), async (c) => c.json(await bagReturns(), 200));
app.openapi(createRoute({ method: "get", path: "/sparklines", operationId: "getBagSparklines", tags: ["bags"], request: { query: z.object({ range: z.literal("1D").default("1D") }) }, responses: { 200: { description: "Last 24h hourly bag index (base 100) per bag for list mini charts; empty arrays when unavailable", content: { "application/json": { schema: SparklinesSchema } } } } }), async (c) => c.json(await sparklines(), 200));
app.openapi(createRoute({ method: "get", path: "/{id}", operationId: "getBag", tags: ["bags"], request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Editorial bag", content: { "application/json": { schema: BagResponseSchema } } }, 404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const bag = findBag(c.req.valid("param").id);
  return bag ? c.json({ bag: await publicBag(bag) }, 200) : c.json({ error: "Bag not found" }, 404);
});
app.openapi(createRoute({ method: "get", path: "/{id}/chart", operationId: "getBagChart", tags: ["bags"], request: { params: z.object({ id: z.string() }), query: z.object({ range: ChartRangeSchema.default("1D") }) }, responses: { 200: { description: "Weight-normalised bag index from tokens.xyz candles (base 100); points empty with a reason when unavailable", content: { "application/json": { schema: BagChartSchema } } }, 404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const bag = findBag(c.req.valid("param").id);
  return bag ? c.json(await bagChart(bag, c.req.valid("query").range), 200) : c.json({ error: "Bag not found" }, 404);
});
app.openapi(createRoute({ method: "get", path: "/{id}/history", operationId: "getBagHistory", tags: ["bags"], request: { params: z.object({ id: z.string() }), query: z.object({ range: HistoryRangeSchema.default("7d") }) }, responses: { 200: { description: "Per-asset candles (tokens.xyz, or hourly snapshots as fallback) and a weighted bag index", content: { "application/json": { schema: HistorySchema } } }, 404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const bag = findBag(c.req.valid("param").id);
  return bag ? c.json(await bagHistory(bag, c.req.valid("query").range), 200) : c.json({ error: "Bag not found" }, 404);
});
export default app;

export const assetRoutes = new OpenAPIHono();
assetRoutes.openapi(createRoute({ method: "get", path: "/{mint}/chart", operationId: "getAssetChart", tags: ["bags"], request: { params: z.object({ mint: z.string().regex(base58Mint) }), query: z.object({ range: ChartRangeSchema.default("1D") }) }, responses: { 200: { description: "Closes and candles for one allowlisted asset mint from tokens.xyz; points empty with a reason when unavailable", content: { "application/json": { schema: AssetChartSchema } } }, 404: { description: "Mint is not an allowlisted bag asset", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const mint = c.req.valid("param").mint;
  const symbol = knownSymbol(mint);
  return symbol ? c.json(await assetChart(mint, symbol, c.req.valid("query").range), 200) : c.json({ error: "Asset not found" }, 404);
});
