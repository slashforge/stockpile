import { app } from "./src/app";
import { bags, publicBag, trackAllMints } from "./src/lib/bags";
import { bagReturns } from "./src/lib/charts";
import { referencePrices24h, snapshotPrices } from "./src/lib/history";
import { configureReferencePrices, marketSnapshot } from "./src/lib/market";

// Warm market, icon and brand colour caches so the first mobile request does not pay for provider calls.
trackAllMints();
configureReferencePrices(referencePrices24h);
void marketSnapshot().then(() => Promise.all(bags.map(publicBag))).catch(() => undefined);
// Bag-card returns take a few seconds cold; compute them at boot so the first card never waits.
void bagReturns().catch(() => undefined);
// Keep market data fresh in the background so request handlers only ever read the cache.
setInterval(() => { void marketSnapshot().catch(() => undefined); }, 60_000).unref();
// Hourly price snapshots (idempotent per hour) feed /bags/{id}/history and the fixed 24h change reference.
const snapshot = () => { void snapshotPrices().catch(() => undefined); };
setTimeout(snapshot, 15_000).unref();
setInterval(snapshot, 60 * 60_000).unref();

export default {
  port: Number(process.env.PORT ?? 4040),
  fetch: app.fetch,
  idleTimeout: 30,
};
