// Wallet activity from Helius RPC `getTransactionsForAddress` (full jsonParsed transactions, newest first, paginated by Helius'
// opaque `paginationToken`, which is our cursor). Legs are derived from `meta` only, the way riven-cash's transaction helpers do:
// per-mint token deltas over balances owned by the wallet (Token + Token-2022, via `uiAmountString`, which the RPC has already
// scaled for Token-2022 scaled-UI mints) and the wallet's lamport delta with the fee it paid and rent for token accounts it
// opened/closed added back. Helius labels (`type`, `description`) are never used. Pages are cached 30s per wallet+cursor+limit.
import { bagIdsForMint, configuredSymbol } from "./bags";
import { base58Mint, USDC } from "./constants";
import { atomicToUi } from "./portfolio";
import { tokenMetadata, WSOL_MINT } from "./token-meta";

export const activityErrorCodes = ["NO_WALLET", "PROVIDER_NOT_CONFIGURED", "PROVIDER_UNAVAILABLE", "INVALID_CURSOR"] as const;
export type ActivityErrorCode = (typeof activityErrorCodes)[number];
export type ActivityError = { code: ActivityErrorCode; message: string };
export type ActivityKind = "swap" | "transfer-in" | "transfer-out" | "other";
export type ActivityLeg = { mint: string; symbol: string | null; amount: string; direction: "in" | "out" };
export type Activity = { signature: string; ts: string | null; kind: ActivityKind; status: "confirmed" | "failed"; summary: string; legs: ActivityLeg[]; feeLamports: number; bagId: string | null; bagLinked: boolean; explorerUrl: string };
export type ActivityPage = { items: Activity[]; nextCursor: string | null; asOf: string };
export type ActivityResult = { ok: true; value: ActivityPage } | { ok: false; error: ActivityError };
export type KnownToken = { symbol: string | null; decimals: number | null };

export const HELIUS_MAX_LIMIT = 100;
export const cursorPattern = /^\d{1,12}:\d{1,6}$/;
const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{43,100}$/;
const cacheTtl = 30_000;
const maxCacheEntries = 500;
const solDustLamports = 10_000n; // wrapped-SOL residue / rent rounding left over next to real token legs
const stableLike = new Set(["USDC", "USDT", "SOL"]);
type Json = Record<string, unknown>;
type Change = { mint: string; delta: bigint; scale: number };
type TokenBalance = { accountIndex: number; owner: string; mint: string; atomic: bigint; ui: string | null; decimals: number };
const cache = new Map<string, { expiresAt: number; page: ActivityPage; pending?: Promise<ActivityPage> }>();
const programLabels: Record<string, string> = {
  "spl-associated-token-account": "Token account setup", "spl-token": "Token program interaction", "spl-token-2022": "Token program interaction", system: "System transaction",
  vote: "Vote", "spl-memo": "Memo", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter transaction", "jupiter": "Jupiter transaction",
};

const record = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const list = (value: unknown): Json[] => Array.isArray(value) ? value.map(record).filter((item): item is Json => item !== null) : [];
const address = (value: unknown): string | null => typeof value === "string" && base58Mint.test(value) ? value : null;
const lamports = (value: unknown): bigint | null => typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null;
const short = (value: string) => `${value.slice(0, 4)}…${value.slice(-4)}`;

/** Non-negative decimal string -> atomic at `scale` (null when malformed or more precise than `scale`). */
export function decimalToAtomic(value: string, scale: number): bigint | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > scale) return null;
  return BigInt(`${match[1]}${fraction.padEnd(scale, "0")}`);
}

/** Trims a UI amount for prose: at most 6 fraction digits unless that would read as zero. */
export function formatAmount(amount: string): string {
  const [whole = "0", fraction = ""] = amount.split(".");
  if (!fraction) return whole;
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  if (trimmed || whole !== "0") return trimmed ? `${whole}.${trimmed}` : whole;
  return `${whole}.${fraction.slice(0, 9).replace(/0+$/, "")}`;
}

function accountKeys(tx: Json): string[] {
  const message = record(record(tx.transaction)?.message);
  const keys = list(message?.accountKeys).map((key) => address(key.pubkey)).filter((key): key is string => key !== null);
  const loaded = record(record(tx.meta)?.loadedAddresses);
  // Versioned transactions append lookup-table addresses (writable, then readonly) after the static keys; balances are indexed the same way.
  for (const group of ["writable", "readonly"] as const) for (const key of Array.isArray(loaded?.[group]) ? loaded![group] as unknown[] : []) { const value = address(key); if (value) keys.push(value); }
  return keys;
}
/** First account key: the transaction's fee payer (null when the payload is malformed). */
export function feePayerOf(value: unknown): string | null { const tx = record(value); return tx ? accountKeys(tx)[0] ?? null : null; }
/** Slot and block time of a jsonParsed transaction. */
export function transactionMeta(value: unknown): { slot: number | null; blockTime: Date | null; failed: boolean } {
  const tx = record(value) ?? {};
  const meta = record(tx.meta) ?? {};
  return { slot: typeof tx.slot === "number" && Number.isSafeInteger(tx.slot) ? tx.slot : null, blockTime: typeof tx.blockTime === "number" && Number.isSafeInteger(tx.blockTime) && tx.blockTime > 0 ? new Date(tx.blockTime * 1000) : null, failed: meta.err !== null && meta.err !== undefined };
}
/**
 * Raw base-unit balance change of `mint` for `wallet` (owner-filtered pre/post `uiTokenAmount.amount`, unscaled -- the unit Jupiter
 * quotes and `getTokenAccountsByOwner` report), with the mint's on-chain decimals. Null when the wallet has no balance for the mint.
 */
export function rawTokenDelta(value: unknown, wallet: string, mint: string): { delta: bigint; decimals: number } | null {
  const meta = record(record(value)?.meta) ?? {};
  const pre = tokenBalances(meta.preTokenBalances).filter((b) => b.owner === wallet && b.mint === mint), post = tokenBalances(meta.postTokenBalances).filter((b) => b.owner === wallet && b.mint === mint);
  const decimals = [...pre, ...post][0]?.decimals;
  if (decimals === undefined) return null;
  return { delta: post.reduce((sum, b) => sum + b.atomic, 0n) - pre.reduce((sum, b) => sum + b.atomic, 0n), decimals };
}

function tokenBalances(value: unknown): TokenBalance[] {
  return list(value).flatMap((balance) => {
    const amount = record(balance.uiTokenAmount);
    const owner = address(balance.owner), mint = address(balance.mint), atomic = lamports(amount?.amount);
    const decimals = typeof amount?.decimals === "number" && Number.isInteger(amount.decimals) && amount.decimals >= 0 ? amount.decimals : null;
    if (!owner || !mint || atomic === null || decimals === null || typeof balance.accountIndex !== "number") return [];
    const ui = typeof amount?.uiAmountString === "string" && /^\d+(\.\d+)?$/.test(amount.uiAmountString) ? amount.uiAmountString : null;
    return [{ accountIndex: balance.accountIndex, owner, mint, atomic, ui, decimals }];
  });
}

/** Signed per-mint balance changes for `wallet` (native SOL keyed by the wrapped-SOL mint; fee and ATA rent excluded). */
export function walletChanges(tx: Json, wallet: string): { changes: Change[]; feePaid: bigint; walletIndex: number } {
  const meta = record(tx.meta) ?? {};
  const keys = accountKeys(tx);
  const walletIndex = keys.indexOf(wallet);
  const fee = lamports(meta.fee) ?? 0n;
  const feePaid = walletIndex === 0 ? fee : 0n;
  const pre = tokenBalances(meta.preTokenBalances), post = tokenBalances(meta.postTokenBalances);
  const preLamports = Array.isArray(meta.preBalances) ? meta.preBalances : [], postLamports = Array.isArray(meta.postBalances) ? meta.postBalances : [];
  const accountDelta = (index: number) => { const a = lamports(preLamports[index]), b = lamports(postLamports[index]); return a === null || b === null ? 0n : b - a; };

  // Token deltas: uiAmountString is authoritative (already scaled for Token-2022 scaled-UI mints); raw amount/decimals otherwise.
  const byMint = new Map<string, { pre: bigint; post: bigint; scale: number }>();
  const uiScale = (balance: TokenBalance) => Math.max(balance.decimals, balance.ui?.split(".")[1]?.length ?? 0);
  for (const balance of [...pre, ...post]) if (balance.owner === wallet) { const entry = byMint.get(balance.mint) ?? { pre: 0n, post: 0n, scale: balance.decimals }; entry.scale = Math.max(entry.scale, uiScale(balance)); byMint.set(balance.mint, entry); }
  const atomicAt = (balance: TokenBalance, scale: number) => (balance.ui !== null ? decimalToAtomic(balance.ui, scale) : null) ?? balance.atomic * 10n ** BigInt(scale - balance.decimals);
  for (const balance of pre) if (balance.owner === wallet) { const entry = byMint.get(balance.mint)!; entry.pre += atomicAt(balance, entry.scale); }
  for (const balance of post) if (balance.owner === wallet) { const entry = byMint.get(balance.mint)!; entry.post += atomicAt(balance, entry.scale); }
  const changes: Change[] = [];
  for (const [mint, entry] of byMint) if (entry.post !== entry.pre) changes.push({ mint, delta: entry.post - entry.pre, scale: entry.scale });

  // Native SOL: wallet delta + fee it paid + rent it funded for its own token accounts opened here (or minus rent refunded on close).
  if (walletIndex >= 0) {
    let sol = accountDelta(walletIndex) + feePaid;
    const preIndexes = new Set(pre.filter((b) => b.owner === wallet).map((b) => b.accountIndex));
    const postIndexes = new Set(post.filter((b) => b.owner === wallet).map((b) => b.accountIndex));
    let rent = 0n;
    for (const index of postIndexes) if (!preIndexes.has(index)) rent += accountDelta(index);
    for (const index of preIndexes) if (!postIndexes.has(index)) rent += accountDelta(index);
    // Only credit rent the wallet actually paid (a depositor may have funded the ATA); refunds only if the wallet received them.
    if (rent > 0n && sol <= -rent) sol += rent; else if (rent < 0n && sol >= -rent) sol += rent;
    const wsol = changes.find((change) => change.mint === WSOL_MINT);
    if (wsol) wsol.delta += sol * 10n ** BigInt(wsol.scale - 9);
    else if (sol !== 0n) changes.push({ mint: WSOL_MINT, delta: sol, scale: 9 });
  }
  const tokenLegs = changes.some((change) => change.mint !== WSOL_MINT && change.delta !== 0n);
  return { changes: changes.filter((change) => change.delta !== 0n && !(change.mint === WSOL_MINT && tokenLegs && (change.delta < 0n ? -change.delta : change.delta) < solDustLamports * 10n ** BigInt(change.scale - 9))), feePaid, walletIndex };
}

function programLabel(tx: Json): string {
  const instructions = list(record(record(tx.transaction)?.message)?.instructions);
  const labels: string[] = [];
  for (const instruction of instructions) {
    const program = typeof instruction.program === "string" ? instruction.program : typeof instruction.programId === "string" ? instruction.programId : "";
    if (!program || program === "ComputeBudget111111111111111111111111111111") continue;
    const label = programLabels[program] ?? (program.length > 40 ? `Program ${short(program)}` : `${program[0]!.toUpperCase()}${program.slice(1)} program`);
    if (!labels.includes(label)) labels.push(label);
  }
  // Setup-only transactions are named by their most specific program (ATA creation), not the generic token program.
  const specific = labels.find((label) => label !== "Token program interaction" && label !== "System transaction");
  return specific ?? labels[0] ?? "Transaction";
}

function counterparty(tx: Json, wallet: string, leg: Change): string | null {
  const meta = record(tx.meta) ?? {};
  const wantsNegative = leg.delta > 0n; // wallet received, so the counterparty's balance fell
  let best: { owner: string; delta: bigint } | null = null;
  if (leg.mint !== WSOL_MINT) {
    const pre = tokenBalances(meta.preTokenBalances), post = tokenBalances(meta.postTokenBalances);
    const owners = new Set([...pre, ...post].filter((b) => b.mint === leg.mint && b.owner !== wallet).map((b) => b.owner));
    for (const owner of owners) {
      const sum = (balances: TokenBalance[]) => balances.filter((b) => b.owner === owner && b.mint === leg.mint).reduce((total, b) => total + b.atomic, 0n);
      const delta = sum(post) - sum(pre);
      if ((wantsNegative && delta < 0n && (!best || delta < best.delta)) || (!wantsNegative && delta > 0n && (!best || delta > best.delta))) best = { owner, delta };
    }
    return best?.owner ?? null;
  }
  const keys = accountKeys(tx);
  const fee = lamports(meta.fee) ?? 0n;
  const preLamports = Array.isArray(meta.preBalances) ? meta.preBalances : [], postLamports = Array.isArray(meta.postBalances) ? meta.postBalances : [];
  for (const [index, key] of keys.entries()) {
    if (key === wallet) continue;
    const a = lamports(preLamports[index]), b = lamports(postLamports[index]);
    if (a === null || b === null) continue;
    const delta = b - a + (index === 0 ? fee : 0n);
    if ((wantsNegative && delta < 0n && (!best || delta < best.delta)) || (!wantsNegative && delta > 0n && (!best || delta > best.delta))) best = { owner: key, delta };
  }
  return best?.owner ?? null;
}

const describe = (leg: ActivityLeg) => `${formatAmount(leg.amount)} ${leg.symbol ?? short(leg.mint)}`;

/** Normalises one full jsonParsed transaction into an Activity for `wallet`; null when it has no valid signature. */
export async function normaliseActivity(value: unknown, wallet: string, known: Map<string, KnownToken>): Promise<Activity | null> {
  const tx = record(value);
  const signatures = Array.isArray(record(tx?.transaction)?.signatures) ? (record(tx!.transaction)!.signatures as unknown[]) : [];
  const signature = typeof signatures[0] === "string" && signaturePattern.test(signatures[0]) ? signatures[0] : null;
  if (!tx || !signature) return null;
  const meta = record(tx.meta) ?? {};
  const failed = meta.err !== null && meta.err !== undefined;
  const { changes, feePaid } = failed ? { changes: [] as Change[], feePaid: accountKeys(tx)[0] === wallet ? lamports(meta.fee) ?? 0n : 0n } : walletChanges(tx, wallet);
  const legs = changes.map((change): ActivityLeg => ({
    mint: change.mint, symbol: change.mint === WSOL_MINT ? "SOL" : change.mint === USDC ? "USDC" : configuredSymbol(change.mint) ?? known.get(change.mint)?.symbol ?? null,
    amount: atomicToUi(change.delta < 0n ? -change.delta : change.delta, change.scale), direction: change.delta < 0n ? "out" : "in",
  })).sort((a, b) => (a.direction === b.direction ? 0 : a.direction === "out" ? -1 : 1)); // what was paid, then what was received
  const ins = legs.filter((leg) => leg.direction === "in"), outs = legs.filter((leg) => leg.direction === "out");
  const kind: ActivityKind = ins.length === 1 && outs.length === 1 ? "swap" : ins.length && !outs.length ? "transfer-in" : outs.length && !ins.length ? "transfer-out" : "other";
  let summary: string;
  if (kind === "swap") {
    const paid = outs[0]!, received = ins[0]!;
    const paidStable = stableLike.has(paid.symbol ?? ""), receivedStable = stableLike.has(received.symbol ?? "");
    summary = paidStable && !receivedStable ? `Bought ${describe(received)} for ${describe(paid)}` : receivedStable && !paidStable ? `Sold ${describe(paid)} for ${describe(received)}` : `Swapped ${describe(paid)} for ${describe(received)}`;
  } else if (kind === "transfer-in" || kind === "transfer-out") {
    const primary = changes.find((change) => change.mint !== WSOL_MINT) ?? changes[0]!;
    const other = counterparty(tx, wallet, primary);
    summary = kind === "transfer-in" ? `Received ${ins.map(describe).join(", ")}${other ? ` from ${short(other)}` : ""}` : `Sent ${outs.map(describe).join(", ")}${other ? ` to ${short(other)}` : ""}`;
  } else if (legs.length) summary = `Sent ${outs.map(describe).join(", ")}; received ${ins.map(describe).join(", ")}`;
  else summary = `${failed ? "Failed: " : ""}${programLabel(tx)}`;
  const bagId = kind === "swap" && outs[0]!.mint === USDC ? (await bagIdsForMint(ins[0]!.mint))[0] ?? null : kind === "swap" && ins[0]!.mint === USDC ? (await bagIdsForMint(outs[0]!.mint))[0] ?? null : null;
  const blockTime = typeof tx.blockTime === "number" && Number.isSafeInteger(tx.blockTime) && tx.blockTime > 0 ? new Date(tx.blockTime * 1000).toISOString() : null;
  return { signature, ts: blockTime, kind, status: failed ? "failed" : "confirmed", summary, legs, feeLamports: Number(feePaid), bagId, bagLinked: false, explorerUrl: `https://solscan.io/tx/${signature}` };
}

/** Normalises one RPC page: resolves unknown symbols through Jupiter once for the whole page. */
export async function normalisePage(items: unknown[], wallet: string, nextCursor: string | null): Promise<ActivityPage> {
  const mints = new Set<string>();
  for (const item of items) { const tx = record(item); if (tx && (record(tx.meta)?.err ?? null) === null) for (const change of walletChanges(tx, wallet).changes) mints.add(change.mint); }
  const meta = await tokenMetadata(mints).catch(() => new Map());
  const known = new Map<string, KnownToken>([...mints].map((mint) => [mint, { symbol: meta.get(mint)?.symbol ?? null, decimals: meta.get(mint)?.decimals ?? null }]));
  const activities: Activity[] = [];
  for (const item of items) { const activity = await normaliseActivity(item, wallet, known); if (activity) activities.push(activity); }
  return { items: activities, nextCursor, asOf: new Date().toISOString() };
}

class InvalidCursorError extends Error {}

async function fetchPage(wallet: string, cursor: string | undefined, limit: number, key: string): Promise<ActivityPage> {
  const params = [wallet, { transactionDetails: "full", encoding: "jsonParsed", maxSupportedTransactionVersion: 1, limit, sortOrder: "desc", commitment: "confirmed", ...(cursor ? { paginationToken: cursor } : {}), filters: { tokenAccounts: "balanceChanged" } }];
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransactionsForAddress", params }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Helius ${response.status}`);
  const body = record(await response.json());
  const error = record(body?.error);
  if (error) { if (/pagination token/i.test(String(error.message ?? ""))) throw new InvalidCursorError(); throw new Error(`Helius RPC error ${String(error.code ?? "")}`); }
  const result = record(body?.result);
  if (!result || !Array.isArray(result.data)) throw new Error("Helius result malformed");
  const token = typeof result.paginationToken === "string" && cursorPattern.test(result.paginationToken) ? result.paginationToken : null;
  return normalisePage(result.data, wallet, token);
}

/** One page of wallet activity, newest first. Cached 30s per wallet+cursor+limit (in-flight requests are shared, failures not cached). */
export async function readActivity(wallet: string | null, cursor: string | undefined, limit: number): Promise<ActivityResult> {
  if (!wallet) return { ok: false, error: { code: "NO_WALLET", message: "No verified Solana wallet linked to this Privy identity" } };
  const key = process.env.HELIUS_API_KEY;
  if (!key) return { ok: false, error: { code: "PROVIDER_NOT_CONFIGURED", message: "Helius is not configured" } };
  if (cursor !== undefined && !cursorPattern.test(cursor)) return { ok: false, error: { code: "INVALID_CURSOR", message: "Invalid activity cursor" } };
  const size = Math.min(Math.max(limit, 1), HELIUS_MAX_LIMIT);
  const cacheKey = `${wallet}:${cursor ?? ""}:${size}`;
  let entry = cache.get(cacheKey);
  if (entry && entry.expiresAt > Date.now()) return { ok: true, value: entry.page };
  if (!entry?.pending) {
    if (cache.size >= maxCacheEntries) cache.delete(cache.keys().next().value!);
    const pending = fetchPage(wallet, cursor, size, key);
    entry = { expiresAt: 0, page: entry?.page ?? { items: [], nextCursor: null, asOf: new Date(0).toISOString() }, pending };
    cache.set(cacheKey, entry);
    pending.then((page) => { cache.set(cacheKey, { expiresAt: Date.now() + cacheTtl, page }); }, () => { cache.delete(cacheKey); });
  }
  try { return { ok: true, value: await entry.pending! }; }
  catch (error) {
    if (error instanceof InvalidCursorError) return { ok: false, error: { code: "INVALID_CURSOR", message: "Invalid activity cursor" } };
    return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Activity provider unavailable" } };
  }
}

export function resetActivityCache() { cache.clear(); }
