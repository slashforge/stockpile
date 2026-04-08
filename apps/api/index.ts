import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authRoutes } from "./src/routes";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: (origin) => origin || process.env.BETTER_AUTH_URL || "http://localhost:8081",
  allowHeaders: ["Content-Type", "Authorization", "Cookie", "Set-Cookie"],
  allowMethods: ["GET", "POST", "OPTIONS"],
  exposeHeaders: ["Set-Cookie", "Content-Length"],
  credentials: true,
}));

app.onError((err, c) => {
  console.error("Global App Error:", err);
  return c.json({ error: err.message }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);

export default {
  port: 4040,
  fetch: app.fetch,
  idleTimeout: 30,
};
