// `bun run tokens:coverage`: reports, for every known (pinned or verified) bag mint, whether tokens.xyz resolves it and how far back 1D candles go.
// Read-only; needs the TokensApiKey SST secret (run via `sst shell`). Prints one line per mint and never the key.
import { secret } from "../src/lib/config";
import { allSymbols } from "../src/lib/bags";
import { knownMint } from "../src/lib/mint-registry";
import { candlesFor, resolveAsset } from "../src/lib/tokens-api";

if (!secret("TokensApiKey")) { console.log("TokensApiKey secret is not set; nothing to check."); process.exit(1); }
const now = Math.floor(Date.now() / 1000);
const rows: string[] = [];
for (const symbol of [...allSymbols()].sort()) {
  const mint = knownMint(symbol);
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
