// Cloudflare Worker entry (deployed stages). Workers forbid I/O, timers and randomness at module scope,
// so everything that used to run at boot happens on the first request; market data refreshes itself
// stale-while-revalidate on read, and hourly price snapshots run from the cron Worker (cron.ts).
// Local development uses dev.ts (Bun server with background refresh) instead.
import { app } from "./src/app";
import { bagReturns } from "./src/lib/charts";
import { marketSnapshot } from "./src/lib/market";
import { initMarket } from "./src/warm";

let warmed = false;
type Context = NonNullable<Parameters<typeof app.fetch>[2]>;

export default {
  fetch(request: Request, env: object, ctx: Context) {
    initMarket();
    if (!warmed) {
      warmed = true;
      ctx.waitUntil(Promise.all([marketSnapshot(), bagReturns()]).catch(() => undefined));
    }
    return app.fetch(request, env, ctx);
  },
};
