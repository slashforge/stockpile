import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authRoutes, balancesRoutes } from "./src/routes";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.onError((err, c) => {
  console.error("Global App Error:", err);
  return c.json({ error: err.message, stack: err.stack }, 500);
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRoutes);
app.route("/balances", balancesRoutes);

export default {
  port: 4040,
  fetch: app.fetch,
  idleTimeout: 30,
};
