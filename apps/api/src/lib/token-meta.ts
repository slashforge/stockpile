// Per-mint token metadata and USD price from Jupiter Tokens v2 (`/tokens/v2/search?query=<mint,...>`), the same
// batch-by-mint lookup riven-cash uses for wallet assets. Balances never come from here: Helius is the source of truth
// for amounts; Jupiter only supplies symbol / name / icon / decimals / usdPrice. Unknown mints resolve to no entry,
// so callers render nulls rather than invented values. Cached 60s per mint, negative 60s, stale-on-failure.
import { secret } from "./config";
import { base58Mint } from "./constants";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export type TokenMeta = { mint: string; symbol: string | null; name: string | null; iconUrl: string | null; decimals: number | null; usdPrice: number | null; verified: boolean | null; asOf: string };
type Entry = { expiresAt: number; meta: TokenMeta | null };

const ttl = 60_000;
const failureTtl = 20_000;
const maxEntries = 1000;
const batchSize = 50;
const cache = new Map<string, Entry>();

const text = (value: unknown, max = 64) => typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".") ? url.href : null; } catch { return null; }
}

function parseToken(raw: unknown, asOf: string): TokenMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const token = raw as Record<string, unknown>;
  if (typeof token.id !== "string" || !base58Mint.test(token.id)) return null;
  const decimals = num(token.decimals);
  return {
    mint: token.id, symbol: text(token.symbol), name: text(token.name, 128), iconUrl: safeUrl(token.icon),
    decimals: decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null,
    usdPrice: (num(token.usdPrice) ?? -1) > 0 ? num(token.usdPrice) : null, verified: typeof token.isVerified === "boolean" ? token.isVerified : null, asOf,
  };
}

async function fetchBatch(mints: string[], key: string): Promise<Map<string, TokenMeta>> {
  const response = await fetch(`https://api.jup.ag/tokens/v2/search?query=${mints.join(",")}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Jupiter tokens ${response.status}`);
  const tokens: unknown = await response.json();
  const asOf = new Date().toISOString();
  const found = new Map<string, TokenMeta>();
  if (Array.isArray(tokens)) for (const token of tokens) { const meta = parseToken(token, asOf); if (meta && mints.includes(meta.mint)) found.set(meta.mint, meta); }
  return found;
}

/** Metadata for the given mints (only those Jupiter knows). Without the `JupiterApiKey` secret returns whatever is cached. */
export async function tokenMetadata(mints: Iterable<string>): Promise<Map<string, TokenMeta>> {
  const key = secret("JupiterApiKey");
  const wanted = [...new Set(mints)].filter((mint) => base58Mint.test(mint));
  const result = new Map<string, TokenMeta>();
  const missing: string[] = [];
  const now = Date.now();
  for (const mint of wanted) {
    const entry = cache.get(mint);
    if (entry && entry.expiresAt > now) { if (entry.meta) result.set(mint, entry.meta); } else missing.push(mint);
  }
  if (!key || !missing.length) { for (const mint of missing) { const stale = cache.get(mint)?.meta; if (stale) result.set(mint, stale); } return result; }
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    try {
      const found = await fetchBatch(batch, key);
      for (const mint of batch) {
        const meta = found.get(mint) ?? null;
        if (cache.size >= maxEntries && !cache.has(mint)) cache.delete(cache.keys().next().value!);
        cache.set(mint, { expiresAt: Date.now() + ttl, meta });
        if (meta) result.set(mint, meta);
      }
    } catch {
      for (const mint of batch) {
        const stale = cache.get(mint)?.meta ?? null;
        cache.set(mint, { expiresAt: Date.now() + failureTtl, meta: stale });
        if (stale) result.set(mint, stale);
      }
    }
  }
  return result;
}

export function resetTokenMetaCache() { cache.clear(); }
