import { secret } from "./config";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

/** Jupiter orders use Stockpile's paymaster for fees and ATA rent only; the wallet signs the swap. */
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const MAX_COMPUTE_UNITS = 1_400_000n;
export const MAX_PRIORITY_FEE_LAMPORTS = 200_000n;
export const MIN_PAYMASTER_LAMPORTS = 20_000_000;
export const minimumSponsorBalance = (legs: number) => Math.max(MIN_PAYMASTER_LAMPORTS, legs * (3 * 2_100_000 + Number(MAX_PRIORITY_FEE_LAMPORTS) + 10_000));
let cachedKey: { raw: string; keypair: Keypair } | null = null;

export function paymaster(): Keypair | null {
  const raw = secret("SolanaPaymasterKey");
  if (!raw) return null;
  if (cachedKey?.raw === raw) return cachedKey.keypair;
  try {
    const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
    const keypair = Keypair.fromSecretKey(bytes);
    cachedKey = { raw, keypair };
    return keypair;
  } catch { return null; }
}

export function rpcUrl(): string | null {
  const key = secret("HeliusApiKey");
  return key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : null;
}
export async function getBalance(url: string, address: string): Promise<number> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address, { commitment: "confirmed" }] }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`RPC getBalance ${response.status}`);
  const body = await response.json() as { result?: { value?: number }; error?: unknown };
  const value = body.result?.value;
  if (body.error || typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Sponsor balance unavailable");
  return value;
}

export function sponsoredSwapExcludedDexes(): string { return "Manifest"; }
export class SwapSponsorshipError extends Error {}

/** Inspect the exact order transaction without changing its message (Jupiter execute owns its requestId). */
export function inspectSponsoredSwap(transaction: VersionedTransaction, payer: PublicKey, taker: PublicKey): void {
  const { message } = transaction;
  const keys = message.staticAccountKeys;
  const signers = keys.slice(0, message.header.numRequiredSignatures);
  if (!signers[0]?.equals(payer) || payer.equals(taker)) throw new SwapSponsorshipError("The swap is not paid by Stockpile's paymaster");
  if (!signers.some((key) => key.equals(taker)) || signers.some((key) => !key.equals(payer) && !key.equals(taker))) throw new SwapSponsorshipError("Unexpected swap signers");
  if (!transaction.signatures[0]?.every((byte) => byte === 0)) throw new SwapSponsorshipError("The swap is already signed by the paymaster");
  if (keys.slice(1).some((key) => key.equals(payer))) throw new SwapSponsorshipError("Duplicate paymaster key");
  let limit: bigint | undefined;
  let price = 0n;
  let createdAccounts = 0;
  for (const instruction of message.compiledInstructions) {
    const program = keys[instruction.programIdIndex];
    const uses = instruction.accountKeyIndexes.flatMap((index, position) => index === 0 ? [position] : []);
    const data = Buffer.from(instruction.data);
    if (instruction.programIdIndex === 0) throw new SwapSponsorshipError("The swap invokes the paymaster");
    if (program?.equals(ComputeBudgetProgram.programId)) {
      if (uses.length) throw new SwapSponsorshipError("Compute budget uses the paymaster");
      if (data.length === 5 && data[0] === 2 && limit === undefined) limit = BigInt(data.readUInt32LE(1));
      else if (data.length === 9 && data[0] === 3 && price === 0n) price = data.readBigUInt64LE(1);
      else throw new SwapSponsorshipError("Unsupported compute budget");
      continue;
    }
    if (!uses.length) continue;
    const onlyAt = (position: number) => uses.length === 1 && uses[0] === position;
    if (program?.equals(ATA_PROGRAM) && data.length <= 1 && (data.length === 0 || data[0] === 0 || data[0] === 1) && onlyAt(0)) { createdAccounts++; continue; }
    // The wallet may refund rent to the paymaster, but the paymaster may never transfer SOL out.
    if (program?.equals(SystemProgram.programId) && data.length === 12 && data.readUInt32LE(0) === 2 && onlyAt(1)
      && keys[instruction.accountKeyIndexes[0]!]?.equals(taker)) continue;
    throw new SwapSponsorshipError("The swap uses the paymaster for more than fees and rent");
  }
  if (createdAccounts > 3) throw new SwapSponsorshipError("The swap creates too many token accounts");
  const units = limit ?? MAX_COMPUTE_UNITS;
  if (units <= 0n || units > MAX_COMPUTE_UNITS) throw new SwapSponsorshipError("The swap requests too many compute units");
  if (price * units > MAX_PRIORITY_FEE_LAMPORTS * 1_000_000n) throw new SwapSponsorshipError("The swap requests an unsponsorable priority fee");
}

export function sponsorSwapTransaction(base64: string, payer: Keypair, taker: string): string {
  let transaction: VersionedTransaction;
  try { transaction = VersionedTransaction.deserialize(Buffer.from(base64, "base64")); }
  catch { throw new SwapSponsorshipError("Jupiter returned an undecodable transaction"); }
  inspectSponsoredSwap(transaction, payer.publicKey, new PublicKey(taker));
  transaction.sign([payer]);
  const bytes = transaction.serialize();
  if (bytes.length > 1232) throw new SwapSponsorshipError("Transaction too large");
  return Buffer.from(bytes).toString("base64");
}
