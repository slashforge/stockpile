// Which Solana mint backs each bag symbol. Nothing is configured per token: mints come from the issuers' live directories
// (xStocks per-symbol API, PreStocks directory) and must pass Jupiter verification (exact mint, symbol, decimals,
// `verified` + issuer tag, live USDC route). Two guards sit on top:
// xStocks whose live mint equals the pinned (previously Jupiter-verified) mint skip the per-mint Jupiter calls; only new
// listings are verified at runtime, which keeps warm-up within Jupiter's rate limit.
// - pins (issuer-assets.ts): a directory that suddenly reports a different mint for an already-verified symbol is refused;
// - STOCKPILE_BLOCKED_MINTS: comma-separated mints or symbols switched off immediately, without a deploy.
import { pinnedMint } from "./issuer-assets";
import { issuerAsset } from "./issuer-assets";
import { verifyIssuerMint, type IssuerTag } from "./prestocks";
import { base58Mint } from "./constants";

export type MintResolution = { mint: string; decimals: number | null; uiAmountMultiplier: number };

const resolved = new Map<string, string>();
const seeded = new Map<string, string>();

function blockedSet(): Set<string> {
  return new Set((process.env.STOCKPILE_BLOCKED_MINTS ?? "").split(",").map((item) => item.trim()).filter(Boolean));
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
  if (tag === "xstocks" && expected === listedMint) {
    resolved.set(symbol, listedMint);
    return { mint: listedMint, decimals: issuerAsset(symbol)?.decimals ?? null, uiAmountMultiplier: 1 };
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

export function resetMintRegistry() { seeded.clear(); resolved.clear(); }
