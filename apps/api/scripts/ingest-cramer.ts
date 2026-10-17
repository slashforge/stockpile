// `bun run cramer:ingest [-- --dry-run] [--backfill DAYS] [--limit N]`
// Default: same as the CramerIngest cron (Mad Money RSS feed, new articles only). --backfill reads CNBC's sitemaps for
// articles with "cramer" in the slug from the last DAYS days (the feed only covers ~2 weeks). --dry-run reads and classifies
// but writes nothing (it still makes OpenAI calls for articles that link a tradable ticker).
import { discoverFromSitemaps, ingestCramer, inverseCramer } from "../src/lib/cramer";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const dryRun = args.includes("--dry-run");
const backfill = flag("--backfill");
const limit = Number(flag("--limit") ?? (backfill ? 400 : 12));

const articles = backfill ? await discoverFromSitemaps(Number(backfill)) : undefined;
if (articles) console.log(`sitemaps: ${articles.length} Cramer article URLs in the last ${backfill} days`);
const result = await ingestCramer({ articles, limit, dryRun, deadlineMs: backfill ? 60 * 60_000 : undefined });
const { preview, ...summary } = result;
console.log(JSON.stringify(summary, null, 2));
if (preview) {
  for (const call of preview) console.log(`${call.saidAt.toISOString().slice(0, 10)} ${call.ticker.padEnd(6)} ${call.stance.padEnd(8)} "${call.quote}"  ${call.articleUrl}`);
  console.log("inverse-cramer (dry run):", inverseCramer(preview).map((asset) => `${asset.symbol} ${asset.weightBps / 100}% (net ${asset.netCalls})`).join(", ") || "empty");
}
process.exit(result.failed && !result.classified && !result.withoutTickers ? 1 : 0);
