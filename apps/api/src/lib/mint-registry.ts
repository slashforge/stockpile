// Which Solana mint backs each bag symbol. Nothing is configured per token: mints come from the issuers' live directories
// (xStocks per-symbol API, PreStocks directory) and must pass Jupiter verification (exact mint, symbol, decimals,
// `verified` + issuer tag, live USDC route). Two guards sit on top:
// - pins (issuer-assets.ts): a directory that suddenly reports a different mint for an already-verified symbol is refused;
// - BlockedMints SST secret: comma-separated mints or symbols switched off (set the secret, then redeploy).
import { secret } from "./config";
import { issuerAsset, pinnedMint, pinnedXStocks } from "./issuer-assets";
import { verifyIssuerMint, type IssuerTag } from "./prestocks";
import { base58Mint } from "./constants";

export type MintResolution = { mint: string; decimals: number | null; uiAmountMultiplier: number };

const resolved = new Map<string, string>();
const seeded = new Map<string, string>();
let pinnedVerification: Map<string, MintResolution> | null = null;
let pinnedExpiresAt = 0;
let pinnedPending: Promise<Map<string, MintResolution>> | undefined;

async function verifiedPins(): Promise<Map<string, MintResolution>> {
  if (pinnedVerification && pinnedExpiresAt > Date.now()) return pinnedVerification;
  if (!pinnedPending) {
    pinnedPending = (async () => {
      const key = secret("JupiterApiKey");
      if (!key) throw new Error("Jupiter is not configured");
      const pins = pinnedXStocks();
      const result = new Map<string, MintResolution>();
      for (let i = 0; i < pins.length; i += 100) {
        const batch = pins.slice(i, i + 100);
        const response = await fetch(`https://api.jup.ag/tokens/v2/search?query=${batch.map(([, mint]) => mint).join(",")}`,
          { headers: { "x-api-key": key }, signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw new Error(`Jupiter tokens ${response.status}`);
        const tokens: unknown = await response.json();
        if (!Array.isArray(tokens)) throw new Error("Invalid Jupiter tokens response");
        for (const [symbol, mint] of batch) {
          const token = tokens.find((item) => item && typeof item === "object" && item.id === mint);
          if (token?.symbol === symbol && token.decimals === issuerAsset(symbol)?.decimals
            && Array.isArray(token.tags) && token.tags.includes("verified") && token.tags.includes("xstocks")) {
            result.set(symbol, { mint, decimals: token.decimals, uiAmountMultiplier: 1 });
          }
        }
      }
      pinnedVerification = result;
      pinnedExpiresAt = Date.now() + 60 * 60 * 1000;
      return result;
    })().catch(() => {
      // Fail closed, but share a short cooldown so all bag legs do not retry an outage.
      pinnedVerification = new Map();
      pinnedExpiresAt = Date.now() + 20_000;
      return pinnedVerification;
    }).finally(() => { pinnedPending = undefined; });
  }
  return pinnedPending;
}

function blockedSet(): Set<string> {
  return new Set((secret("BlockedMints") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

/** True when the operator has switched this symbol or mint off. */
export function isBlocked(symbol: string, mint: string | null): boolean {
  const blocked = blockedSet();
  return blocked.has(symbol) || (mint !== null && blocked.has(mint));
}

/**
 * Validates an issuer-listed mint for `symbol`: not blocked, consistent with any pin (or test seed), verified on Jupiter.
 * Remembers the result so synchronous lookups (portfolio labels, activity, bag membership) can use it.
 */
export async function verifyListedMint(symbol: string, listedMint: string, tag: IssuerTag): Promise<MintResolution | null> {
  const expected = seeded.get(symbol) ?? pinnedMint(symbol);
  if (expected && expected !== listedMint) {
    console.warn(`[mints] ${tag} directory lists ${listedMint} for ${symbol}, expected ${expected}; refusing until re-verified`);
    return null;
  }
  if (isBlocked(symbol, listedMint)) return null;
  if (tag === "xstocks" && seeded.get(symbol) === listedMint) return { mint: listedMint, decimals: issuerAsset(symbol)?.decimals ?? null, uiAmountMultiplier: 1 };
  if (tag === "xstocks" && pinnedMint(symbol) === listedMint) {
    const verification = (await verifiedPins()).get(symbol) ?? null;
    if (verification) resolved.set(symbol, listedMint);
    return verification;
  }
  const verification = await verifyIssuerMint({ symbol, mint: listedMint }, tag);
  if (!verification.verified) return null;
  resolved.set(symbol, listedMint);
  return { mint: listedMint, decimals: verification.decimals, uiAmountMultiplier: verification.uiAmountMultiplier };
}

/** Test seam: a seeded symbol's mint is treated as already verified (and as the pin issuer directories must match). */
export function seededMint(symbol: string): string | null {
  const mint = seeded.get(symbol) ?? null;
  return mint && !isBlocked(symbol, mint) ? mint : null;
}

/** Best known mint for a symbol without network: seed, last live resolution, or pin. Never a blocked mint. */
export function knownMint(symbol: string): string | null {
  const mint = seeded.get(symbol) ?? resolved.get(symbol) ?? pinnedMint(symbol);
  return mint && !isBlocked(symbol, mint) ? mint : null;
}

/** Test seam: `"AAPLx:mint,MSFTx:mint"`; malformed entries are ignored. Replaces previous seeds and live resolutions. */
export function seedMints(spec: string) {
  resetMintRegistry();
  for (const [symbol, mint] of spec.split(",").map((item) => item.trim().split(":"))) {
    if (symbol && mint && base58Mint.test(mint)) seeded.set(symbol, mint);
  }
}

export function resetMintRegistry() {
  seeded.clear(); resolved.clear(); pinnedVerification = null; pinnedExpiresAt = 0; pinnedPending = undefined;
}
