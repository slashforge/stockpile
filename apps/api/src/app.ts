import { Resource } from "sst";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { HealthResponseSchema } from "./schemas";
import { authRoutes } from "./routes";

export const openApiConfig = {
  openapi: "3.1.0",
  info: {
    title: "Stackforge API",
    version: "1.0.0",
  },
} as const;

export const app = new OpenAPIHono();

let allowedOrigins: Set<string> | null = null;

function getAllowedOrigins() {
  allowedOrigins ??= new Set(
    [
      Resource.AppConfig.apiUrl,
      Resource.AppConfig.webUrl,
      "http://localhost:8081",
      "http://localhost:19006",
      "http://localhost:4321",
    ].filter(Boolean)
  );
  return allowedOrigins;
}

app.use("*", logger());
app.use("*", cors({
  origin: (origin) => {
    if (!origin) return Resource.AppConfig.apiUrl;
    return getAllowedOrigins().has(origin) ? origin : null;
  },
  allowHeaders: ["Content-Type", "Authorization", "Cookie", "Set-Cookie"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: ["Set-Cookie", "Content-Length"],
  credentials: true,
}));

app.onError((err, c) => {
  console.error("Global App Error:", err);
  return c.json({ error: err.message }, 500);
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["system"],
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "Service health status",
    },
  },
});

app.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));

app.route("/auth", authRoutes);

app.doc31("/openapi.json", openApiConfig);
