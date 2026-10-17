// Cloudflare cron Worker (deployed stages, infra/api.ts): classifies new CNBC Mad Money articles into cramer_calls, which
// feed the inverse-cramer bag. Idempotent (examined articles are recorded); local stages run `bun run cramer:ingest` instead.
import { ingestCramer } from "./src/lib/cramer";

export default {
  async scheduled() {
    const result = await ingestCramer();
    console.log("cramer ingest", JSON.stringify(result));
    // Feed unreachable, or every examined article failed: fail the invocation so it shows up in Cloudflare.
    const feedDown = result.errors.some((error) => error.startsWith("feed:"));
    if (feedDown || (result.examined > 0 && result.failed === result.examined)) throw new Error(`Cramer ingest failed: ${result.errors[0]}`);
  },
};
