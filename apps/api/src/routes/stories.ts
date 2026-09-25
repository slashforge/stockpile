import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { findBag } from "../lib/bags";
import { listStories } from "../lib/story-feed";
import { ErrorSchema, StoriesResponseSchema } from "../schemas";

const app = new OpenAPIHono();
const query = z.object({ limit: z.coerce.number().int().min(1).max(20).optional(), cursor: z.string().regex(/^[a-f0-9]{32}$/).optional(), format: z.enum(["article", "podcast", "disclosure"]).optional() });
const response = { 200: { description: "Persisted sourced stories", content: { "application/json": { schema: StoriesResponseSchema } } },
  400: { description: "Invalid cursor", content: { "application/json": { schema: ErrorSchema } } } };

app.openapi(createRoute({ method: "get", path: "/", operationId: "listStories", tags: ["stories"], request: { query }, responses: response }), async (c) => {
  const { limit = 10, cursor, format } = c.req.valid("query");
  const page = await listStories(limit, cursor, undefined, format);
  return page ? c.json(page, 200) : c.json({ error: "Invalid story cursor" }, 400);
});

export const bagStoryRoutes = new OpenAPIHono();
bagStoryRoutes.openapi(createRoute({ method: "get", path: "/{id}/stories", operationId: "listBagStories", tags: ["stories"],
  request: { params: z.object({ id: z.string() }), query }, responses: { ...response,
    404: { description: "Bag not found", content: { "application/json": { schema: ErrorSchema } } } } }), async (c) => {
  const id = c.req.valid("param").id;
  if (!findBag(id)) return c.json({ error: "Bag not found" }, 404);
  const { limit = 10, cursor, format } = c.req.valid("query");
  const page = await listStories(limit, cursor, id, format);
  return page ? c.json(page, 200) : c.json({ error: "Invalid story cursor" }, 400);
});
export default app;
