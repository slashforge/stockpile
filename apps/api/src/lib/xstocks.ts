// xStocks issuer directory: https://api.xstocks.fi/api/v2/public/assets/{symbol}. The Solana deployment address listed there
// is the tradable mint; it is still verified on Jupiter (mint-registry.ts) before a bag can trade it. Cached per symbol
// (stale-while-revalidate, stale-on-failure); an explicit 404 drops the listing so a delisted token stops trading.
import { feature } from "./config";
import { base58Mint } from "./constants";
import { boundedJson } from "./prestocks";

export const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public/assets";
export type XStockListing = { symbol: string; mint: string; name: string; logoUrl: string | null };

const ttl = 10 * 60 * 1000;
const failureTtl = 2 * 60 * 1000;
const maxBytes = 64 * 1024;
type Entry = { value: XStockListing | null; expiresAt: number; pending?: Promise<XStockListing | null> };
const listings = new Map<string, Entry>();

/** Strictly validates one asset payload; returns null for anything malformed or not deployed on Solana. Exported for tests. */
export function parseXStock(value: unknown, symbol: string): XStockListing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.symbol !== symbol) return null;
  const deployments = Array.isArray(row.deployments) ? row.deployments as Record<string, unknown>[] : [];
  const solana = deployments.filter((item) => item && item.network === "Solana");
  const mint = solana.length === 1 && typeof solana[0]!.address === "string" && base58Mint.test(solana[0]!.address) && solana[0]!.address.startsWith("Xs") ? solana[0]!.address : null;
  const name = typeof row.name === "string" && row.name.length >= 2 && row.name.length <= 80 ? row.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : null;
  if (!mint || !name) return null;
  let logoUrl: string | null = null;
  try {
    const url = typeof row.logo === "string" ? new URL(row.logo) : null;
    if (url && url.protocol === "https:" && url.hostname === "xstocks-metadata.backed.fi") logoUrl = url.href;
  } catch { /* no logo */ }
  return { symbol, mint, name, logoUrl };
}

class NotListed extends Error {}

async function fetchListing(symbol: string): Promise<XStockListing | null> {
  const response = await fetch(`${XSTOCKS_API}/${encodeURIComponent(symbol)}`, { redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (response.status === 404) throw new NotListed();
  return parseXStock(await boundedJson(response, maxBytes), symbol);
}

/** Current xStocks listing for `symbol`, or null when unlisted, malformed, disabled, or never reachable. */
export async function xStockListing(symbol: string): Promise<XStockListing | null> {
  if (!feature("xstocks") || !/^[A-Z][A-Za-z0-9.]{0,11}x$/.test(symbol)) return null;
  let entry = listings.get(symbol);
  if (!entry) { entry = { value: null, expiresAt: 0 }; listings.set(symbol, entry); }
  if (entry.expiresAt <= Date.now() && !entry.pending) {
    const cached = entry;
    cached.pending = fetchListing(symbol)
      .then((value) => { cached.value = value; cached.expiresAt = Date.now() + (value ? ttl : failureTtl); return value; })
      .catch((error: unknown) => {
        if (error instanceof NotListed) cached.value = null;
        // Unreachable with nothing cached: retry soon rather than leaving the asset research-only for minutes.
        cached.expiresAt = Date.now() + (error instanceof NotListed || cached.value ? failureTtl : 15 * 1000);
        if (!(error instanceof NotListed)) console.warn(`[mints] xStocks directory ${symbol}: ${error instanceof Error ? error.message : error}`);
        return cached.value;
      })
      .finally(() => { cached.pending = undefined; });
  }
  if (!entry.value && entry.pending) return entry.pending;
  return entry.value;
}

export function resetXStocksCache() { listings.clear(); }
