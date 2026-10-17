// Cloudflare cron Worker (deployed stages, infra/api.ts): STOCK Act disclosures from CongressInvests into
// congress_disclosures, which feed the pelosi-tracker and congress-consensus bags. Idempotent; local stages run
// `bun run congress:ingest` manually instead (dev.ts restarts on every edit and would burn the 100 req/day free tier).
import { ingestCongress, tickerToSymbol } from "./src/lib/congress";

export default {
  async scheduled() {
    const result = await ingestCongress();
    console.log("congress ingest", JSON.stringify(result));
    // Every ticker failing means nothing was refreshed (provider down or rate limited); fail the invocation so it shows up.
    if (result.errors.length >= Object.keys(tickerToSymbol).length) throw new Error(`Congress ingest failed for every ticker: ${result.errors[0]}`);
  },
};
