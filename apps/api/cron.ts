// Cloudflare cron Worker (deployed stages, infra/api.ts): hourly price snapshots feeding /bags/{id}/history
// and the fixed 24h change reference. Idempotent per hour. Locally dev.ts runs the same job on an interval.
import { snapshotPrices } from "./src/lib/history";
import { initMarket } from "./src/warm";

export default {
  async scheduled() {
    initMarket();
    const result = await snapshotPrices();
    console.log("price snapshot", JSON.stringify(result));
  },
};
