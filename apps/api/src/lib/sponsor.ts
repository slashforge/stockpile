import { secret } from "./config";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Stockpile pays every swap's network fee and token-account rent from a platform paymaster, so a
 * wallet that only holds USDC can trade. The user still signs the swap itself and still bears the
 * price risk (slippage); only SOL costs are sponsored.
 *
 * Jupiter's `/swap/v2/build` is asked to use the paymaster as `payer`. The returned instructions are
 * checked so the paymaster can only fund fees, rent and account creation, never send SOL elsewhere,
 * then the transaction is simulated and the paymaster's SOL spend is capped before it pre-signs.
 */

export const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
/** System instructions that move lamports out of a signer to an arbitrary account. */
const SYSTEM_TRANSFERS = new Set([2, 11]); // Transfer, TransferWithSeed
const PACKET_DATA_SIZE = 1232;
const CU_LIMIT_MAX = 1_400_000;
/** Jupiter's CU price tracks recent fees and can spike; never bid above 1 lamport per CU. */
export const MAX_CU_PRICE_MICRO_LAMPORTS = 1_000_000n;
/** Most the paymaster may spend on one swap: fee + priority fee + a few token-account rents. */
export const MAX_SPONSOR_LAMPORTS = 12_000_000;
/** Below this the paymaster can't reliably cover rent + fees; refuse instead of failing on chain. */
export const MIN_PAYMASTER_LAMPORTS = 20_000_000;
/**
 * Helius Sender (SWQOS-only tier) needs a SOL tip to one of its tip accounts plus a priority fee in
 * every transaction. The paymaster pays the 5,000-lamport minimum so swaps land fast without the
 * user holding SOL. See https://www.helius.dev/docs/sending-transactions/sender
 */
export const SENDER_TIP_LAMPORTS = 5_000;
export const SENDER_TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE", "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ", "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn", "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD", "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF", "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT", "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
] as const;
/** Priority fee used when Jupiter doesn't suggest one; Sender rejects transactions without any. */
const DEFAULT_CU_PRICE_MICRO_LAMPORTS = 10_000;

let cachedKey: { raw: string; keypair: Keypair } | null = null;

/** The paymaster keypair from the `SolanaPaymasterKey` secret (base58 secret key or solana-keygen JSON array). */
export function paymaster(): Keypair | null {
  const raw = secret("SolanaPaymasterKey");
  if (!raw) return null;
  if (cachedKey?.raw === raw) return cachedKey.keypair;
  try {
    const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : bs58.decode(raw);
    const keypair = Keypair.fromSecretKey(bytes);
    cachedKey = { raw, keypair };
    return keypair;
  } catch {
    return null;
  }
}

export function rpcUrl(): string | null {
  const key = secret("HeliusApiKey");
  return key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : null;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`RPC ${method} ${res.status}`);
  const body = await res.json() as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) throw new Error(body.error?.message ?? `RPC ${method} failed`);
  return body.result;
}

export async function getBalance(url: string, address: string): Promise<number> {
  return (await rpc<{ value: number }>(url, "getBalance", [address, { commitment: "confirmed" }])).value;
}

export type Simulation = { err: unknown; logs: string[]; unitsConsumed: number | null; payerLamportsAfter: number | null };

export async function simulate(url: string, transaction: VersionedTransaction, payer: string): Promise<Simulation> {
  const encoded = Buffer.from(transaction.serialize()).toString("base64");
  const { value } = await rpc<{ value: { err: unknown; logs?: string[] | null; unitsConsumed?: number; accounts?: ({ lamports: number } | null)[] | null } }>(url, "simulateTransaction", [
    encoded,
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed", accounts: { encoding: "base64", addresses: [payer] } },
  ]);
  return { err: value.err ?? null, logs: value.logs ?? [], unitsConsumed: typeof value.unitsConsumed === "number" ? value.unitsConsumed : null, payerLamportsAfter: value.accounts?.[0]?.lamports ?? null };
}

/** Jupiter's slippage guard (`SlippageToleranceExceeded`, custom error 6001 / 0x1771). */
export function isSlippageFailure(simulation: Pick<Simulation, "err" | "logs">): boolean {
  const err = JSON.stringify(simulation.err ?? "");
  return /"Custom":6001\b/.test(err) || simulation.logs.some((line) => /0x1771|SlippageToleranceExceeded/i.test(line));
}

export type ApiInstruction = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
export type BuildResponse = {
  inputMint: string; outputMint: string; inAmount: string; outAmount: string; otherAmountThreshold?: string; slippageBps?: number; priceImpactPct?: string; routePlan?: unknown[];
  computeBudgetInstructions?: ApiInstruction[]; setupInstructions?: ApiInstruction[]; swapInstruction?: ApiInstruction; cleanupInstruction?: ApiInstruction | null; otherInstructions?: ApiInstruction[];
  addressesByLookupTableAddress?: Record<string, string[]> | null;
  blockhashWithMetadata?: { blockhash: number[]; lastValidBlockHeight: number };
};

function toInstruction(ix: ApiInstruction): TransactionInstruction {
  return new TransactionInstruction({ programId: new PublicKey(ix.programId), keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })), data: Buffer.from(ix.data, "base64") });
}

/** Keeps only `setComputeUnitPrice` and clamps it; the limit is set from simulation instead. */
export function clampedPriceInstructions(instructions: ApiInstruction[]): TransactionInstruction[] {
  const out: TransactionInstruction[] = [];
  for (const ix of instructions) {
    if (ix.programId !== COMPUTE_BUDGET_PROGRAM) continue;
    const data = Buffer.from(ix.data, "base64");
    if (data[0] !== 3 || data.length < 9) continue;
    const price = data.readBigUInt64LE(1);
    out.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price > MAX_CU_PRICE_MICRO_LAMPORTS ? MAX_CU_PRICE_MICRO_LAMPORTS : price }));
  }
  return out;
}

/**
 * Where the paymaster may appear. It funds token-account creation (ATA program, System create) and
 * the swap's own rent (Jupiter), and nothing else: no transfers, no token program, no unknown programs.
 */
export function sponsorProblems(instructions: ApiInstruction[], payer: string, taker: string): string[] {
  const problems: string[] = [];
  for (const ix of instructions) {
    const signers = ix.accounts.filter((a) => a.isSigner).map((a) => a.pubkey);
    const unexpected = signers.filter((key) => key !== payer && key !== taker);
    if (unexpected.length) problems.push(`instruction for ${ix.programId} needs an unexpected signer`);
    if (!ix.accounts.some((a) => a.pubkey === payer)) continue;
    if (ix.programId === ATA_PROGRAM || ix.programId === JUPITER_PROGRAM) continue;
    if (ix.programId === SYSTEM_PROGRAM) {
      const kind = Buffer.from(ix.data, "base64").readUInt32LE(0);
      if (!SYSTEM_TRANSFERS.has(kind)) continue;
    }
    problems.push(`paymaster used by ${ix.programId}`);
  }
  return problems;
}

function lookupTables(raw: Record<string, string[]> | null | undefined): AddressLookupTableAccount[] {
  return Object.entries(raw ?? {}).map(([key, addresses]) => new AddressLookupTableAccount({
    key: new PublicKey(key),
    state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: addresses.map((a) => new PublicKey(a)) },
  }));
}

export type SponsoredResult =
  | { ok: true; transaction: string; lastValidBlockHeight: number | null; sponsorLamports: number | null }
  | { ok: false; reason: "invalid" | "slippage" | "simulation" | "overspend" | "rpc"; message: string };

/**
 * Compiles a `/build` response into a v0 transaction paid by the paymaster: simulate at the max CU
 * limit, set the limit to 1.2x usage, re-check the paymaster spend, then pre-sign as fee payer.
 */
export async function compileSponsored(build: BuildResponse, taker: string, payer: Keypair, url: string): Promise<SponsoredResult> {
  const payerKey = payer.publicKey.toBase58();
  if (!build.swapInstruction || build.swapInstruction.programId !== JUPITER_PROGRAM) return { ok: false, reason: "invalid", message: "swap does not route through Jupiter" };
  const raw = [...(build.setupInstructions ?? []), build.swapInstruction, ...(build.cleanupInstruction ? [build.cleanupInstruction] : []), ...(build.otherInstructions ?? [])];
  const problems = sponsorProblems(raw, payerKey, taker);
  if (problems.length) return { ok: false, reason: "invalid", message: problems.join("; ") };
  const blockhashBytes = build.blockhashWithMetadata?.blockhash;
  if (!Array.isArray(blockhashBytes) || blockhashBytes.length !== 32) return { ok: false, reason: "invalid", message: "missing blockhash" };
  const recentBlockhash = new PublicKey(Uint8Array.from(blockhashBytes)).toBase58();
  const tables = lookupTables(build.addressesByLookupTableAddress);
  const instructions = raw.map(toInstruction);
  const clamped = clampedPriceInstructions(build.computeBudgetInstructions ?? []);
  const price = clamped.length ? clamped : [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: DEFAULT_CU_PRICE_MICRO_LAMPORTS })];
  const tipAccount = SENDER_TIP_ACCOUNTS[Math.floor(Math.random() * SENDER_TIP_ACCOUNTS.length)]!;
  const tip = SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(tipAccount), lamports: SENDER_TIP_LAMPORTS });
  const compile = (units: number) => new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ...price, ...instructions, tip],
  }).compileToV0Message(tables));

  let before: number;
  let simulation: Simulation;
  try {
    before = await getBalance(url, payerKey);
    if (before < MIN_PAYMASTER_LAMPORTS) return { ok: false, reason: "rpc", message: "fee sponsor is low on SOL" };
    simulation = await simulate(url, compile(CU_LIMIT_MAX), payerKey);
  } catch (error) {
    return { ok: false, reason: "rpc", message: error instanceof Error ? error.message : "RPC unavailable" };
  }
  if (simulation.err) {
    return isSlippageFailure(simulation)
      ? { ok: false, reason: "slippage", message: "price moved past the limit while building" }
      : { ok: false, reason: "simulation", message: `simulation failed: ${JSON.stringify(simulation.err)}` };
  }
  const spent = simulation.payerLamportsAfter == null ? null : before - simulation.payerLamportsAfter;
  if (spent != null && spent > MAX_SPONSOR_LAMPORTS) return { ok: false, reason: "overspend", message: `would cost the sponsor ${spent} lamports` };

  const units = simulation.unitsConsumed ? Math.min(Math.ceil(simulation.unitsConsumed * 1.2), CU_LIMIT_MAX) : CU_LIMIT_MAX;
  const transaction = compile(units);
  const signers = transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures).map((key) => key.toBase58());
  if (signers[0] !== payerKey || !signers.includes(taker) || signers.some((key) => key !== payerKey && key !== taker)) return { ok: false, reason: "invalid", message: "unexpected signer set" };
  transaction.sign([payer]);
  const bytes = transaction.serialize();
  if (bytes.length > PACKET_DATA_SIZE) return { ok: false, reason: "invalid", message: "transaction too large" };
  return { ok: true, transaction: Buffer.from(bytes).toString("base64"), lastValidBlockHeight: build.blockhashWithMetadata?.lastValidBlockHeight ?? null, sponsorLamports: spent };
}
