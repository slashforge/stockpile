import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { bags, findBag, publicBag } from "../lib/bags";
import { BagResponseSchema, BagsSchema, ErrorSchema } from "../schemas";

const app = new OpenAPIHono();
app.openapi(createRoute({ method: "get", path: "/", operationId: "listBags", tags: ["bags"], responses: { 200: { description: "Editorial bags", content: { "application/json": { schema: BagsSchema } } } } }), async (c) => c.json({ bags: await Promise.all(bags.map(publicBag)) }, 200));
app.openapi(createRoute({ method: "get", path: "/{id}", operationId: "getBag", tags: ["bags"], request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Editorial bag", content: { "application/json": { schema: BagResponseSchema } } }, 404: { description: "Not found", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const bag = findBag(c.req.valid("param").id);
  return bag ? c.json({ bag: await publicBag(bag) }, 200) : c.json({ error: "Bag not found" }, 404);
});
export default app;
