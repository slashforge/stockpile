// PreStocks (tokenized pre-IPO exposure on Solana) issuer directory: https://prestocks.com/api/prestocks
// Only PreStocks-issued tokens are used (Stocklana PreStocks bounty rule). The directory is cached in-process
// (stale-while-revalidate, stale-on-failure) and every contract address is independently verified on Jupiter
// (exact mint id, symbol, decimals, tags, live USDC route) before it can back a tradable bag asset.
import { secret, feature } from "./config";
import { USDC } from "./constants";

export const PRESTOCKS_DIRECTORY_URL = "https://prestocks.com/api/prestocks";
export const PRESTOCKS_HOST = "www.prestocks.com";
export const PRESTOCKS_DISCLAIMER = "PreStocks provide only economic exposure to private companies; confer no ownership, voting, dividend, information, or other legal rights; are risky investments; may result in total loss; have no guaranteed secondary-market liquidity; are not affiliated with, endorsed by, or issued by referenced companies; are not available in the U.S., to U.S. persons, or to other ineligible persons.";

export type PreStock = { symbol: string; name: string; description: string; mint: string; imageUrl: string; productUrl: string; markPrice: number; tokenPrice: number; impliedValuation: number; markValuation: number; supply: number };
export type PreStockVerification = { verified: boolean; decimals: number | null; uiAmountMultiplier: number; reason: string | null };
export type Directory = { assets: PreStock[]; asOf: string };

const directoryTtl = 10 * 60 * 1000;
const directoryFailureTtl = 2 * 60 * 1000;
const verificationTtl = 60 * 60 * 1000;
const verificationFailureTtl = 5 * 60 * 1000;
const maxDirectoryBytes = 256 * 1024;
const base58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let directory: { value: Directory | null; expiresAt: number; pending?: Promise<Directory | null> } = { value: null, expiresAt: 0 };
type VerificationEntry = { value: PreStockVerification | null; expiresAt: number; pending?: Promise<PreStockVerification> };
const verifications = new Map<string, VerificationEntry>();

export async function boundedJson(response: Response, maxBytes: number = maxDirectoryBytes): Promise<unknown> {
  if (!response.ok || !response.body || !/json/i.test(response.headers.get("content-type") ?? "") || Number(response.headers.get("content-length") || 0) > maxBytes) throw new Error(`Directory response rejected: ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Directory response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Strictly validates one directory row; returns null for anything malformed. Exported for tests. */
export function parsePreStock(row: unknown): PreStock | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  const symbol = typeof value.symbol === "string" && /^[A-Z][A-Z0-9]{1,11}$/.test(value.symbol) ? value.symbol : null;
  const mint = typeof value.contract_address === "string" && base58.test(value.contract_address) && value.contract_address.startsWith("Pre") ? value.contract_address : null;
  const name = typeof value.name === "string" && value.name.length >= 3 && value.name.length <= 80 ? value.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : null;
  const description = typeof value.description === "string" ? value.description.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) : "";
  const image = safeUrl(value.image, /^\/logos\/[a-z0-9-]+\.png$/);
  const product = safeUrl(value.external_url, /^\/[a-z0-9-]+$/);
  const markPrice = finite(value.markPrice), tokenPrice = finite(value.tokenPrice), impliedValuation = finite(value.impliedValuation), markValuation = finite(value.markValuation), supply = finite(value.supply);
  if (!symbol || !mint || !name || !image || !product || markPrice === null || tokenPrice === null || impliedValuation === null || markValuation === null || supply === null) return null;
  return { symbol, name, description, mint, imageUrl: image, productUrl: product, markPrice, tokenPrice, impliedValuation, markValuation, supply };
}

function safeUrl(value: unknown, path: RegExp): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === PRESTOCKS_HOST && path.test(url.pathname) && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

async function fetchDirectory(): Promise<Directory> {
  const response = await fetch(PRESTOCKS_DIRECTORY_URL, { redirect: "error", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  const data = await boundedJson(response);
  if (!Array.isArray(data) || data.length === 0 || data.length > 100) throw new Error("Directory payload rejected");
  const assets = data.map(parsePreStock).filter((item): item is PreStock => item !== null);
  const seen = new Set<string>();
  const unique = assets.filter((asset) => { const key = `${asset.symbol}:${asset.mint}`; if (seen.has(asset.symbol) || seen.has(asset.mint)) return false; seen.add(asset.symbol); seen.add(asset.mint); seen.add(key); return true; });
  if (!unique.length) throw new Error("Directory has no valid assets");
  return { assets: unique, asOf: new Date().toISOString() };
}

/** Cached issuer directory; serves stale data while refreshing and after failures, null only when never fetched. */
export async function preStocksDirectory(): Promise<Directory | null> {
  if (!feature("prestocks")) return null;
  const now = Date.now();
  if (directory.expiresAt <= now && !directory.pending) {
    directory.pending = fetchDirectory().then((value) => {
      directory = { value, expiresAt: Date.now() + directoryTtl };
      return value;
    }).catch(() => {
      directory = { value: directory.value, expiresAt: Date.now() + directoryFailureTtl };
      return directory.value;
    });
  }
  if (!directory.value && directory.pending) await directory.pending;
  return directory.value;
}

export async function preStock(symbol: string): Promise<PreStock | null> {
  return (await preStocksDirectory())?.assets.find((asset) => asset.symbol === symbol) ?? null;
}

const fail = (reason: string): PreStockVerification => ({ verified: false, decimals: null, uiAmountMultiplier: 1, reason });

export type IssuerTag = "prestocks" | "xstocks";
const issuerName: Record<IssuerTag, string> = { prestocks: "PreStocks", xstocks: "xStocks" };

// Warm-up resolves every bag at once; run Jupiter verifications one at a time so the burst stays under the rate limit.
const maxConcurrentVerifications = 1;
let activeVerifications = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (activeVerifications >= maxConcurrentVerifications) await new Promise<void>((resolve) => waiting.push(resolve));
  activeVerifications++;
  try { return await task(); } finally { activeVerifications--; waiting.shift()?.(); }
}
/** Rate limits, 5xx, timeouts and network errors: worth retrying soon instead of caching the failure for minutes. */
const transient = (reason: string | null) => /\b(429|5\d\d)\b|timed? ?out|abort|fetch failed|network|socket|ECONN/i.test(reason ?? "");
const transientFailureTtl = 15 * 1000;

/** Jupiter GET that waits and retries on 429 (honouring Retry-After, capped) instead of failing the verification. */
async function jupiterGet(url: string | URL, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status !== 429 || attempt >= 3) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * 2 ** attempt));
  }
}

async function verifyOnJupiter(asset: { symbol: string; mint: string }, tag: IssuerTag): Promise<PreStockVerification> {
  const key = secret("JupiterApiKey");
  if (!key) return fail("Jupiter is not configured");
  const headers = { "x-api-key": key };
  const search = await jupiterGet(`https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(asset.mint)}`, headers, 5000);
  if (!search.ok) return fail(`Jupiter token search ${search.status}`);
  const tokens: unknown = await search.json();
  const token = Array.isArray(tokens) ? tokens.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === asset.mint) as { symbol?: unknown; decimals?: unknown; tags?: unknown } | undefined : undefined;
  if (!token) return fail("Mint not found on Jupiter");
  if (token.symbol !== asset.symbol) return fail(`Jupiter symbol ${String(token.symbol)} does not match issuer symbol`);
  const decimals = typeof token.decimals === "number" && Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 12 ? token.decimals : null;
  if (decimals === null) return fail("Jupiter decimals missing");
  const tags = Array.isArray(token.tags) ? token.tags : [];
  if (!tags.includes("verified") || !tags.includes(tag)) return fail(`Jupiter tags do not mark this mint as a verified ${issuerName[tag]} token`);
  const quoteUrl = new URL("https://api.jup.ag/swap/v1/quote");
  for (const [k, v] of Object.entries({ inputMint: USDC, outputMint: asset.mint, amount: "1000000", slippageBps: "50", restrictIntermediateTokens: "true" })) quoteUrl.searchParams.set(k, v);
  const quote = await jupiterGet(quoteUrl, headers, 6000);
  if (!quote.ok) return fail(`No USDC route on Jupiter (${quote.status})`);
  const quoted = await quote.json() as { outputMint?: unknown; outAmount?: unknown };
  if (quoted.outputMint !== asset.mint || typeof quoted.outAmount !== "string" || !/^[1-9]\d*$/.test(quoted.outAmount)) return fail("Jupiter quote did not return this mint");
  // Token-2022 scaled UI amounts (used by some PreStocks after split-style adjustments): raw units differ from wallet-displayed units.
  let uiAmountMultiplier = 1;
  // xStocks read the multiplier from the shared market snapshot instead; skip the extra call.
  if (tag === "xstocks") return { verified: true, decimals, uiAmountMultiplier, reason: null };
  try {
    const price = await jupiterGet(`https://api.jup.ag/price/v3?ids=${encodeURIComponent(asset.mint)}`, headers, 5000);
    if (price.ok) {
      const config = ((await price.json()) as Record<string, { scaledUiConfig?: { multiplier?: unknown; newMultiplier?: unknown; newMultiplierEffectiveAt?: unknown } }>)[asset.mint]?.scaledUiConfig;
      if (config) {
        const effective = typeof config.newMultiplierEffectiveAt === "string" ? Date.parse(config.newMultiplierEffectiveAt) : NaN;
        const candidate = Number.isFinite(effective) && effective <= Date.now() ? config.newMultiplier : config.multiplier;
        if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) uiAmountMultiplier = candidate;
      }
    }
  } catch { /* multiplier stays 1; the raw amounts are still correct */ }
  return { verified: true, decimals, uiAmountMultiplier, reason: null };
}

/**
 * Cached Jupiter verification for an issuer-listed mint: exact mint, same symbol, decimals, `verified` + issuer tag and a
 * live USDC route. A failed refresh keeps the last positive result unless Jupiter now contradicts the listing.
 */
export async function verifyIssuerMint(asset: { symbol: string; mint: string }, tag: IssuerTag): Promise<PreStockVerification> {
  const now = Date.now();
  const key = `${tag}:${asset.symbol}:${asset.mint}`;
  let entry = verifications.get(key);
  if (!entry) { entry = { value: null, expiresAt: 0 }; verifications.set(key, entry); }
  if (entry.expiresAt <= now && !entry.pending) {
    const cached = entry;
    cached.pending = limited(() => verifyOnJupiter(asset, tag)).catch((error: unknown) => fail(error instanceof Error ? error.message : "Verification failed")).then((value) => {
      const keepStale = !value.verified && cached.value?.verified && value.reason !== "Mint not found on Jupiter" && !/does not match|tags do not/.test(value.reason ?? "");
      cached.value = keepStale ? cached.value : value;
      cached.expiresAt = Date.now() + (value.verified ? verificationTtl : transient(value.reason) ? transientFailureTtl : verificationFailureTtl);
      if (!value.verified) console.warn(`[mints] ${tag} ${asset.symbol} not verified: ${value.reason}`);
      cached.pending = undefined;
      return cached.value!;
    });
  }
  if (!entry.value && entry.pending) await entry.pending;
  return entry.value ?? fail("Verification pending");
}

export function verifyPreStock(asset: PreStock): Promise<PreStockVerification> {
  return verifyIssuerMint(asset, "prestocks");
}

export function resetPreStocksCache() { directory = { value: null, expiresAt: 0 }; verifications.clear(); }
