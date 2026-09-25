import { app } from "./src/app";
import { bags, publicBag } from "./src/lib/bags";

// Warm icon + brand colour caches so the first mobile request does not pay for icon resolution.
void Promise.all(bags.map(publicBag)).catch(() => undefined);

export default {
  port: Number(process.env.PORT ?? 4040),
  fetch: app.fetch,
  idleTimeout: 30,
};
