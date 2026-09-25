// `bun run tokens:coverage`: reports, for every allowlisted mint, whether tokens.xyz resolves it and how far back 1D candles go.
// Read-only; needs TOKENS_API_KEY. Prints one line per mint and never the key.
import { allSymbols, configuredMint } from "../src/lib/bags";
import { candlesFor, resolveAsset } from "../src/lib/tokens-api";

if (!process.env.TOKENS_API_KEY) { console.log("TOKENS_API_KEY is not set; nothing to check."); process.exit(1); }
const now = Math.floor(Date.now() / 1000);
const rows: string[] = [];
for (const symbol of [...allSymbols()].sort()) {
  const mint = configuredMint(symbol);
  if (!mint) continue;
  const resolved = await resolveAsset(mint);
  if (resolved === "unconfigured" || !resolved) { rows.push(`${symbol.padEnd(11)} ${mint}  unresolved`); continue; }
  const daily = await candlesFor(mint, "1D", now - 400 * 86400, now);
  const hourly = await candlesFor(mint, "1H", now - 7 * 86400, now);
  const first = daily.ok && daily.candles[0] ? new Date(daily.candles[0].t * 1000).toISOString().slice(0, 10) : null;
  rows.push(`${symbol.padEnd(11)} ${mint}  assetId=${resolved.assetId}  1D=${daily.ok ? daily.candles.length : daily.reason} since ${first ?? "n/a"}  1H(7d)=${hourly.ok ? hourly.candles.length : hourly.reason}`);
}
console.log(rows.join("\n"));
process.exit(0);
