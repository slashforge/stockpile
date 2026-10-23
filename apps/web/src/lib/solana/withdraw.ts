import { PublicKey } from "@solana/web3.js";
import type { Holding, Portfolio } from "@/services/api/types";
import { formatTokenAmount, toBaseUnits } from "@/utils/amounts";
import { decodeTransaction, inspectTransaction, USDC_MINT } from "./transaction";

export const SOL_ASSET = "SOL";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const TOKEN_PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);

/** Something the wallet can send: SOL, USDC or any token it holds. `raw` is the largest single balance (what one transfer can move). */
export type WithdrawAsset = {
  /** "SOL" or the token mint; what the API expects as `asset`. */
  asset: string;
  mint: string | null;
  symbol: string;
  name: string;
  iconUrl: string | null;
  raw: bigint;
  decimals: number;
  /** Token-2022 scaled UI amount (xStocks, PreStocks); 1 for ordinary tokens. */
  multiplier: number;
  usdPrice: number | null;
};

type AssetIndex = Map<string, { symbol: string; name: string; iconUrl: string | null; uiAmountMultiplier: number }>;

function derivedMultiplier(holding: Holding): number {
  if (!holding.uiAmount) return 1;
  const plain = Number(holding.amount) / 10 ** holding.decimals;
  const ratio = Number(holding.uiAmount) / plain;
  return Number.isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 1e-9 ? ratio : 1;
}

export function withdrawableAssets(portfolio: Portfolio | undefined, index: AssetIndex): WithdrawAsset[] {
  if (!portfolio || portfolio.status !== "live") return [];
  const list: WithdrawAsset[] = [];
  if (portfolio.usdc && portfolio.usdc.amount !== "0") {
    const largest = portfolio.holdings.filter((h) => h.mint === USDC_MINT).reduce((max, h) => (BigInt(h.amount) > max ? BigInt(h.amount) : max), 0n);
    list.push({ asset: USDC_MINT, mint: USDC_MINT, symbol: "USDC", name: "USD Coin", iconUrl: null, raw: largest || BigInt(portfolio.usdc.amount), decimals: 6, multiplier: 1, usdPrice: portfolio.usdc.usdPrice });
  }
  if (portfolio.sol && portfolio.sol.amount !== "0") {
    list.push({ asset: SOL_ASSET, mint: null, symbol: "SOL", name: "Solana", iconUrl: null, raw: BigInt(portfolio.sol.amount), decimals: 9, multiplier: 1, usdPrice: portfolio.sol.usdPrice });
  }
  const tokens = new Map<string, WithdrawAsset>();
  for (const holding of portfolio.holdings) {
    if (holding.mint === USDC_MINT || !/^\d+$/.test(holding.amount) || holding.amount === "0") continue;
    const raw = BigInt(holding.amount);
    const existing = tokens.get(holding.mint);
    if (existing && existing.raw >= raw) continue;
    const known = index.get(holding.mint);
    tokens.set(holding.mint, {
      asset: holding.mint,
      mint: holding.mint,
      symbol: holding.symbol ?? known?.symbol ?? `${holding.mint.slice(0, 4)}…`,
      name: holding.name ?? known?.name ?? "Token",
      iconUrl: holding.iconUrl ?? known?.iconUrl ?? null,
      raw,
      decimals: holding.decimals,
      multiplier: known?.uiAmountMultiplier ?? derivedMultiplier(holding),
      usdPrice: holding.usdPrice,
    });
  }
  return [...list, ...[...tokens.values()].sort((a, b) => a.symbol.localeCompare(b.symbol))];
}

/** Display amount (as a wallet shows it, scaled for Token-2022 UI-amount mints). */
export function displayAmount(asset: WithdrawAsset, raw: bigint, maxFractionDigits = 6): string {
  return formatTokenAmount(raw.toString(), asset.decimals, asset.multiplier, maxFractionDigits);
}

/** Typed display amount -> raw base units (truncated), or null when it isn't a positive amount. */
export function parseAmount(asset: WithdrawAsset, input: string): bigint | null {
  const units = toBaseUnits(input, asset.decimals);
  if (!units) return null;
  const raw = asset.multiplier === 1 ? BigInt(units) : BigInt(Math.floor(Number(units) / asset.multiplier));
  return raw > 0n ? raw : null;
}

export function isSolanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

const u32 = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
const u64 = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
const ata = (owner: string, program: string, mint: string) =>
  PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(), new PublicKey(program).toBuffer(), new PublicKey(mint).toBuffer()], new PublicKey(ATA_PROGRAM))[0].toBase58();

export type WithdrawIntent = { walletAddress: string; destination: string; asset: string; amount: bigint };

/**
 * Checks a prepared withdrawal does exactly what the user asked before it is signed: one transfer of `amount` of `asset`
 * from the user's wallet to `destination` (its associated token account for tokens), optionally opening that account,
 * plus compute-budget settings. Anything else blocks signing, so a tampered transaction can't redirect funds.
 */
export function withdrawalProblems(base64: string, intent: WithdrawIntent): string[] {
  let errors: string[];
  try {
    errors = [...inspectTransaction(base64, intent.walletAddress).errors];
  } catch {
    return ["The transaction couldn’t be decoded."];
  }
  const { message } = decodeTransaction(base64);
  if (message.addressTableLookups.length) errors.push("The transaction loads accounts Newsbid can’t check.");
  const keys = message.staticAccountKeys.map((key) => key.toBase58());
  const { walletAddress: wallet, destination, asset, amount } = intent;
  let transfers = 0;
  let unexpected = false;
  for (const ix of message.compiledInstructions) {
    const program = keys[ix.programIdIndex];
    const accounts = ix.accountKeyIndexes.map((index) => keys[index]);
    const data = ix.data;
    if (program === COMPUTE_BUDGET) continue;
    if (asset === SOL_ASSET) {
      if (program === SYSTEM_PROGRAM && data.length === 12 && u32(data, 0) === 2 && accounts.length === 2 && accounts[0] === wallet && accounts[1] === destination && u64(data, 4) === amount) {
        transfers += 1;
        continue;
      }
    } else if (program === ATA_PROGRAM) {
      const tokenProgram = accounts[5];
      if (
        (data.length === 0 || (data.length === 1 && (data[0] === 0 || data[0] === 1))) &&
        accounts.length === 6 && tokenProgram && TOKEN_PROGRAMS.has(tokenProgram) &&
        accounts[0] === wallet && accounts[1] === ata(destination, tokenProgram, asset) && accounts[2] === destination && accounts[3] === asset && accounts[4] === SYSTEM_PROGRAM
      ) {
        continue;
      }
    } else if (program && TOKEN_PROGRAMS.has(program)) {
      if (data.length === 10 && data[0] === 12 && u64(data, 1) === amount && accounts.length === 4 && accounts[1] === asset && accounts[2] === ata(destination, program, asset) && accounts[3] === wallet) {
        transfers += 1;
        continue;
      }
    }
    unexpected = true;
  }
  if (unexpected) errors.push("The transaction does something other than this transfer.");
  if (transfers !== 1) errors.push("The transaction doesn’t send exactly this amount to this address.");
  return errors;
}
