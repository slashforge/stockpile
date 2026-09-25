// Per-bag position tracking ("bag lots"). A lot is one confirmed on-chain swap leg the user attributes to a bag by signature.
// Every amount is derived server-side from the transaction's owner-filtered pre/post token balances (Helius `getTransaction`,
// jsonParsed) -- the client only supplies { bagId, signature }; side (buy/sell) is inferred from which leg is USDC. Positions are
// the running sum of lots per (bag, mint), reconciled against the wallet's live balances (same Helius batch as the portfolio) and
// priced with the same Jupiter token batch. Nothing here submits transactions.
import { createId } from "@stockpile/core/db/schema";
import { feePayerOf, rawTokenDelta, signersOf, transactionMeta, walletChanges, type Activity, type ActivityPage } from "./activity";
import { bagAssets, bags, knownSymbol, findBag, resolveAsset, type Bag } from "./bags";
import { USDC } from "./constants";
import { findLotBySignature, hasBuyLot, insertLot, listLots, lotLinks, type LotRow } from "./lots-store";
import { scaledUiMultiplier } from "./market";
import { atomicToUi, readRawHoldings, usdValueOf } from "./portfolio";
import { tokenMetadata, type TokenMeta } from "./token-meta";

export const legErrorCodes = ["NOT_YOUR_TRANSACTION", "NOT_A_SWAP", "MINT_NOT_IN_BAG", "TRANSACTION_FAILED", "PROVIDER_NOT_CONFIGURED", "PROVIDER_UNAVAILABLE"] as const;
export type LegErrorCode = (typeof legErrorCodes)[number];
export type BagLot = { id: string; bagId: string; mint: string; symbol: string; side: "buy" | "sell"; tokenAmount: string; tokenUiAmount: number; decimals: number; usdcAmount: string; usdcUiAmount: number; signature: string; ts: string | null };
export type RecordLegResult =
  | { status: 200; lot: BagLot } | { status: 202 } | { status: 400; error: string; code: LegErrorCode } | { status: 404; error: string }
  | { status: 409; error: string; code: "SIGNATURE_ALREADY_LINKED"; bagId: string } | { status: 503; error: string; code: LegErrorCode };
export type PositionLeg = { mint: string; symbol: string; iconUrl: string | null; decimals: number; tracked: string; trackedUi: number; walletBalance: string | null; held: string; heldUi: number; usdPrice: number | null; usdValue: number | null; costUsdc: number };
export type BagPosition = { bagId: string; title: string; legs: PositionLeg[]; costUsdc: number; valueUsd: number | null; pnlUsd: number | null; pnlPct: number | null; reconciled: boolean; sellable: boolean; lotCount: number; lastTradedAt: string | null };
export type PositionsResponse = { walletAddress: string | null; status: "live" | "unavailable"; message?: string; bags: BagPosition[] };
type Json = Record<string, unknown>;
type ParsedSwap = { side: "buy" | "sell"; mint: string; tokenAmount: bigint; decimals: number; tokenUiAmount: number; usdcAmount: bigint };

export const signaturePattern = /^[1-9A-HJ-NP-Za-km-z]{43,100}$/;
const usdcUi = (amount: string | bigint) => Number(atomicToUi(amount, 6));
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

export function toBagLot(row: LotRow): BagLot {
  return { id: row.id, bagId: row.bagId, mint: row.mint, symbol: row.symbol, side: row.side, tokenAmount: row.tokenAmount, tokenUiAmount: Number(atomicToUi(row.tokenAmount, row.decimals)), decimals: row.decimals,
    usdcAmount: row.usdcAmount, usdcUiAmount: usdcUi(row.usdcAmount), signature: row.signature, ts: row.blockTime ? row.blockTime.toISOString() : null };
}

/** Helius `getTransaction` (jsonParsed, v0 supported). `null` = not found / not yet confirmed; throws on provider failure. */
export async function fetchTransaction(signature: string, key: string): Promise<Json | null> {
  const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }] }), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Helius ${response.status}`);
  const body = await response.json() as { result?: unknown; error?: unknown };
  if (body.error) throw new Error("Helius RPC error");
  return body.result && typeof body.result === "object" ? body.result as Json : null;
}

/**
 * Interprets a confirmed transaction as exactly one swap for `wallet`: the activity leg parser must yield one leg out and one leg in
 * (SOL residue ignored the same way), one of them USDC. Amounts are the raw base-unit deltas of the wallet's token accounts; the UI
 * amount comes from the RPC's already-scaled `uiAmountString` (Token-2022 scaled-UI mints).
 */
export function parseSwap(tx: Json, wallet: string): { ok: true; value: ParsedSwap } | { ok: false; code: LegErrorCode; error: string } {
  const meta = transactionMeta(tx);
  if (meta.failed) return { ok: false, code: "TRANSACTION_FAILED", error: "The transaction failed on-chain" };
  // Stockpile's paymaster pays the fee on sponsored swaps, so the wallet only has to have signed it.
  if (feePayerOf(tx) !== wallet && !signersOf(tx).includes(wallet)) return { ok: false, code: "NOT_YOUR_TRANSACTION", error: "The transaction was not signed by your wallet" };
  const { changes } = walletChanges(tx, wallet);
  const outs = changes.filter((change) => change.delta < 0n), ins = changes.filter((change) => change.delta > 0n);
  if (outs.length !== 1 || ins.length !== 1) return { ok: false, code: "NOT_A_SWAP", error: "The transaction is not a single-token swap for your wallet" };
  const paid = outs[0]!, received = ins[0]!;
  const side: "buy" | "sell" | null = paid.mint === USDC && received.mint !== USDC ? "buy" : received.mint === USDC && paid.mint !== USDC ? "sell" : null;
  if (!side) return { ok: false, code: "NOT_A_SWAP", error: "The swap must be between USDC and a bag asset" };
  const tokenLeg = side === "buy" ? received : paid;
  const token = rawTokenDelta(tx, wallet, tokenLeg.mint), usdc = rawTokenDelta(tx, wallet, USDC);
  if (!token || !usdc || token.delta === 0n || usdc.delta === 0n) return { ok: false, code: "NOT_A_SWAP", error: "Token balance changes could not be read from the transaction" };
  const abs = (value: bigint) => (value < 0n ? -value : value);
  return { ok: true, value: { side, mint: tokenLeg.mint, tokenAmount: abs(token.delta), decimals: token.decimals, tokenUiAmount: Number(atomicToUi(abs(tokenLeg.delta), tokenLeg.scale)), usdcAmount: abs(usdc.delta) } };
}

async function currentMints(bag: Bag): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const asset of await bagAssets(bag)) { const { mint } = await resolveAsset(bag, asset); if (mint) result.set(mint, asset.symbol); }
  return result;
}

/** Links a confirmed swap to a bag for the user. Idempotent by signature; see the route contract for status codes. */
export async function recordLeg(identity: { id: string; walletAddress: string | null }, bagId: string, signature: string): Promise<RecordLegResult> {
  const bag = findBag(bagId);
  if (!bag) return { status: 404, error: "Bag not found" };
  if (!identity.walletAddress) return { status: 400, error: "No verified Solana wallet linked to this Privy identity", code: "NOT_YOUR_TRANSACTION" };
  const existing = await findLotBySignature(signature);
  if (existing) {
    if (existing.userId !== identity.id) return { status: 400, error: "The transaction was not paid by your wallet", code: "NOT_YOUR_TRANSACTION" };
    return existing.bagId === bagId ? { status: 200, lot: toBagLot(existing) } : { status: 409, error: `Signature is already linked to ${existing.bagId}`, code: "SIGNATURE_ALREADY_LINKED", bagId: existing.bagId };
  }
  const key = process.env.HELIUS_API_KEY;
  if (!key) return { status: 503, error: "Helius is not configured", code: "PROVIDER_NOT_CONFIGURED" };
  let tx: Json | null;
  try { tx = await fetchTransaction(signature, key); } catch { return { status: 503, error: "Transaction provider unavailable", code: "PROVIDER_UNAVAILABLE" }; }
  if (!tx) return { status: 202 };
  const parsed = parseSwap(tx, identity.walletAddress);
  if (!parsed.ok) return { status: 400, error: parsed.error, code: parsed.code };
  const swap = parsed.value;
  const mints = await currentMints(bag);
  let symbol = mints.get(swap.mint) ?? knownSymbol(swap.mint);
  if (!mints.has(swap.mint)) {
    // A mint that left the bag (tracker recomposition) can still be sold out of it when the user bought it into this bag before.
    const prior = swap.side === "sell" ? await hasBuyLot(identity.id, bagId, swap.mint) : null;
    if (!prior) return { status: 400, error: `${symbol ?? swap.mint} is not an asset of ${bag.title}`, code: "MINT_NOT_IN_BAG" };
    symbol = prior.symbol;
  }
  const meta = transactionMeta(tx);
  const inserted = await insertLot({ id: createId("lot"), userId: identity.id, bagId, walletAddress: identity.walletAddress, mint: swap.mint, symbol: symbol ?? swap.mint, side: swap.side, tokenAmount: swap.tokenAmount.toString(), decimals: swap.decimals, usdcAmount: swap.usdcAmount.toString(), signature, slot: meta.slot, blockTime: meta.blockTime });
  if (inserted) return { status: 200, lot: toBagLot(inserted) };
  // Lost a race with a concurrent identical request: serve whatever won.
  const row = await findLotBySignature(signature);
  return row && row.bagId === bagId ? { status: 200, lot: toBagLot(row) } : { status: 409, error: `Signature is already linked to ${row?.bagId ?? "another bag"}`, code: "SIGNATURE_ALREADY_LINKED", bagId: row?.bagId ?? "" };
}

type Tracked = { mint: string; symbol: string; decimals: number; tracked: bigint; costUsdc: bigint; lots: number; last: Date | null };

/** Net position per (bag, mint) from lots: buys minus sells (floored at zero), net USDC in (buys minus sell proceeds). */
export function aggregateLots(rows: LotRow[]): Map<string, Map<string, Tracked>> {
  const byBag = new Map<string, Map<string, Tracked>>();
  for (const row of rows) {
    const legs = byBag.get(row.bagId) ?? new Map<string, Tracked>();
    const leg = legs.get(row.mint) ?? { mint: row.mint, symbol: row.symbol, decimals: row.decimals, tracked: 0n, costUsdc: 0n, lots: 0, last: null };
    const sign = row.side === "buy" ? 1n : -1n;
    leg.tracked += sign * BigInt(row.tokenAmount); leg.costUsdc += sign * BigInt(row.usdcAmount); leg.lots++;
    if (row.blockTime && (!leg.last || row.blockTime > leg.last)) leg.last = row.blockTime;
    legs.set(row.mint, leg); byBag.set(row.bagId, legs);
  }
  for (const legs of byBag.values()) for (const leg of legs.values()) if (leg.tracked < 0n) leg.tracked = 0n;
  return byBag;
}

/**
 * Positions for the user. Wallet balances come from the same Helius batch as the portfolio and prices from the same Jupiter token
 * batch. `held` is what the bag can actually sell: min(tracked, wallet balance); when one mint is tracked in several bags and the
 * wallet holds less than their sum, each bag is capped proportionally (floor(tracked * balance / sumTracked)). `reconciled` is
 * false when any leg's held < tracked. Bags whose every leg is zero are omitted. With balances unavailable, status is "unavailable",
 * held = tracked and walletBalance is null (no invented values); valueUsd is null when any leg is unpriced.
 */
export async function readPositions(identity: { id: string; walletAddress: string | null }): Promise<PositionsResponse> {
  const rows = await listLots(identity.id);
  const byBag = aggregateLots(rows);
  const walletAddress = identity.walletAddress;
  if (!walletAddress) return { walletAddress, status: "unavailable", message: "No verified Solana wallet linked to this Privy identity", bags: [] };
  const active = [...byBag.entries()].filter(([, legs]) => [...legs.values()].some((leg) => leg.tracked > 0n));
  if (!active.length) return { walletAddress, status: "live", bags: [] };
  const raw = await readRawHoldings(walletAddress);
  const balances = new Map<string, bigint>();
  if (raw.ok) for (const holding of raw.holdings) balances.set(holding.mint, (balances.get(holding.mint) ?? 0n) + BigInt(holding.amount));
  const mints = [...new Set(active.flatMap(([, legs]) => [...legs.keys()]))];
  const meta = await tokenMetadata(mints).catch(() => new Map<string, TokenMeta>());
  const multipliers = new Map(await Promise.all(mints.map(async (mint) => [mint, await scaledUiMultiplier(mint)] as const)));
  const totalTracked = new Map<string, bigint>();
  for (const [, legs] of active) for (const leg of legs.values()) totalTracked.set(leg.mint, (totalTracked.get(leg.mint) ?? 0n) + leg.tracked);
  const positions: BagPosition[] = [];
  for (const [bagId, legs] of active) {
    const bag = findBag(bagId);
    const out: PositionLeg[] = [];
    for (const leg of legs.values()) {
      if (leg.tracked === 0n) continue;
      const balance = raw.ok ? balances.get(leg.mint) ?? 0n : null;
      const total = totalTracked.get(leg.mint)!;
      const held = balance === null || balance >= total ? leg.tracked : leg.tracked * balance / total;
      const ui = (amount: bigint) => round6(Number(atomicToUi(amount, leg.decimals)) * (multipliers.get(leg.mint) ?? 1));
      const usdPrice = meta.get(leg.mint)?.usdPrice ?? null;
      out.push({ mint: leg.mint, symbol: leg.symbol, iconUrl: meta.get(leg.mint)?.iconUrl ?? null, decimals: leg.decimals, tracked: leg.tracked.toString(), trackedUi: ui(leg.tracked), walletBalance: balance === null ? null : balance.toString(),
        held: held.toString(), heldUi: ui(held), usdPrice, usdValue: usdValueOf(ui(held).toString(), usdPrice), costUsdc: usdcUi(leg.costUsdc) });
    }
    const costUsdc = round6([...legs.values()].reduce((sum, leg) => sum + usdcUi(leg.costUsdc), 0));
    const valueUsd = out.every((leg) => leg.usdValue !== null) ? round6(out.reduce((sum, leg) => sum + leg.usdValue!, 0)) : null;
    const pnlUsd = valueUsd === null ? null : round6(valueUsd - costUsdc);
    const last = [...legs.values()].reduce<Date | null>((latest, leg) => (leg.last && (!latest || leg.last > latest) ? leg.last : latest), null);
    positions.push({ bagId, title: bag?.title ?? bagId, legs: out, costUsdc, valueUsd, pnlUsd, pnlPct: pnlUsd === null || costUsdc <= 0 ? null : round6((pnlUsd / costUsdc) * 100),
      reconciled: out.every((leg) => leg.held === leg.tracked), sellable: raw.ok && out.some((leg) => leg.held !== "0"), lotCount: [...legs.values()].reduce((sum, leg) => sum + leg.lots, 0), lastTradedAt: last ? last.toISOString() : null });
  }
  positions.sort((a, b) => bags.findIndex((bag) => bag.id === a.bagId) - bags.findIndex((bag) => bag.id === b.bagId));
  return raw.ok ? { walletAddress, status: "live", bags: positions } : { walletAddress, status: "unavailable", message: raw.message, bags: positions };
}

/** The user's position in one bag (null when nothing is held), for sell quotes. */
export async function bagPosition(identity: { id: string; walletAddress: string | null }, bagId: string): Promise<{ position: BagPosition | null; status: "live" | "unavailable"; message?: string }> {
  const result = await readPositions(identity);
  return { position: result.bags.find((bag) => bag.bagId === bagId) ?? null, status: result.status, message: result.message };
}

/** Overrides the guessed `bagId` on activity items with the user's own lot for that signature. */
export async function applyBagLinks(page: ActivityPage, userId: string): Promise<ActivityPage> {
  const linked = await lotLinks(userId, page.items.map((item) => item.signature));
  if (!linked.size) return page;
  const items: Activity[] = page.items.map((item) => (linked.has(item.signature) ? { ...item, bagId: linked.get(item.signature)!, bagLinked: true } : item));
  return { ...page, items };
}
