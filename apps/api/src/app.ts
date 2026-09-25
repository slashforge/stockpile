import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HealthResponseSchema } from "./schemas";
import accountRoutes from "./routes/account";
import bagRoutes from "./routes/bags";
import storyRoutes, { bagStoryRoutes } from "./routes/stories";

export const openApiConfig = { openapi: "3.1.0", info: { title: "Stockpile API", version: "1.0.0" } } as const;
export const app = new OpenAPIHono();
app.use("*", logger());
app.use("*", cors({ origin: (origin) => {
  const allowed = (process.env.CORS_ORIGINS ?? "http://localhost:8081,http://localhost:19006,http://localhost:4321").split(",").map((item) => item.trim());
  return origin && allowed.includes(origin) ? origin : null;
}, allowHeaders: ["Content-Type", "privy-id-token"], allowMethods: ["GET", "POST", "DELETE", "OPTIONS"] }));
app.onError((error, c) => {
  console.error("API request failed", error);
  return c.json({ error: "Service unavailable" }, 503);
});
app.openapi(createRoute({ method: "get", path: "/health", operationId: "getHealth", tags: ["system"], responses: { 200: { description: "Service health", content: { "application/json": { schema: HealthResponseSchema } } } } }), (c) => c.json({ status: "ok" }, 200));
app.route("/bags", bagRoutes);
app.route("/bags", bagStoryRoutes);
app.route("/stories", storyRoutes);
app.route("/", accountRoutes);
app.doc31("/openapi.json", openApiConfig);
