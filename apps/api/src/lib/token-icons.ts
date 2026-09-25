import { brandColorFor } from "./brand-color";

// These are explicitly mapped underlying-company logos, not xStock token logos.
const brandIcon: Record<string, string> = {
  AAPLx: "apple", NVDAx: "nvidia", AMDx: "amd",
  GOOGLx: "google", TSLAx: "tesla", NFLXx: "netflix",
};
const brandBase = "https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/";
const alternateBrandIcon: Record<string, string> = {
  MSFTx: "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
  AMZNx: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
};
const successTtl = 24 * 60 * 60 * 1000;
const failureTtl = 5 * 60 * 1000;
const maxEntries = 100;
type Icon = { iconUrl: string | null; iconSource: "jupiter-token" | "issuer-token" | "underlying-brand" | null; brandColor: string | null };
type Entry = { expiresAt: number; iconUrl: string | null; staleUrl: string | null; pending?: Promise<string | null> };
const cache = new Map<string, Entry>();

function safeIconUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase()) &&
      !/^\d+(\.\d+){3}$/.test(url.hostname) && url.hostname.includes(".") ? url.href : null;
  } catch { return null; }
}

async function fetchTokenIcon(mint: string, key: string): Promise<string | null> {
  const response = await fetch(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`, {
    headers: { "x-api-key": key }, signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) return null;
  const tokens: unknown = await response.json();
  if (!Array.isArray(tokens)) return null;
  const exact = tokens.find((token) => token && typeof token === "object" && token.id === mint);
  return safeIconUrl(exact?.icon);
}

export async function assetIcon(symbol: string, verifiedMint: string | null, issuerLogoUrl?: string | null): Promise<Icon> {
  // Brand colour is only derived from issuer/Jupiter-hosted token PNGs; underlying-brand SVGs get null.
  const fallback = async (): Promise<Icon> => {
    if (issuerLogoUrl) return { iconUrl: issuerLogoUrl, iconSource: "issuer-token", brandColor: await brandColorFor(issuerLogoUrl) };
    const iconUrl = brandIcon[symbol] ? `${brandBase}${brandIcon[symbol]}.svg` : alternateBrandIcon[symbol];
    return iconUrl ? { iconUrl, iconSource: "underlying-brand", brandColor: null } : { iconUrl: null, iconSource: null, brandColor: null };
  };
  const key = process.env.JUPITER_API_KEY;
  if (!verifiedMint || !key) return fallback();

  let entry = cache.get(verifiedMint);
  const now = Date.now();
  if (!entry) {
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    entry = { expiresAt: 0, iconUrl: null, staleUrl: null };
    cache.set(verifiedMint, entry);
  }
  if (entry.expiresAt <= now && !entry.pending) {
    const cached = entry;
    cached.pending = fetchTokenIcon(verifiedMint, key).catch(() => null).then((iconUrl) => {
      cached.iconUrl = iconUrl;
      if (iconUrl) cached.staleUrl = iconUrl;
      cached.expiresAt = Date.now() + (iconUrl ? successTtl : failureTtl);
      cached.pending = undefined;
      return iconUrl;
    });
  }
  if (entry.pending) await entry.pending;
  const iconUrl = entry.iconUrl ?? entry.staleUrl;
  return iconUrl ? { iconUrl, iconSource: "jupiter-token", brandColor: await brandColorFor(iconUrl) } : fallback();
}
