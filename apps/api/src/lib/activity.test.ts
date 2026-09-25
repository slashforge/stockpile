import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { setSecrets, setFeatures, resetConfig } from "./config";
import { decimalToAtomic, formatAmount, normaliseActivity, normalisePage, readActivity, resetActivityCache, walletChanges } from "./activity";
import { kalshiBuy, KALSHI_MINT, polymarketBuy, POLYMARKET_MINT, solDeposit, TEST_WALLET as WALLET, usdcDeposit } from "./activity.fixture";
import { resetTokenMetaCache, WSOL_MINT } from "./token-meta";
import { resetMintRegistry, seedMints } from "./mint-registry";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const UNKNOWN = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const sig = (n: number) => `${n.toString().replace(/0/g, "z")}${"5".repeat(87 - String(n).length)}`; // 88-char base58 signature
const originalFetch = globalThis.fetch;
const none = new Map();

type Key = { pubkey: string; signer?: boolean; writable?: boolean };
type Balance = { accountIndex: number; owner: string; mint: string; amount: string; decimals: number; ui?: string };
/** Builds a jsonParsed transaction with the given account keys, lamport balances and token balances (synthetic, real shape). */
function tx(n: number, options: { keys: Key[]; pre: number[]; post: number[]; preTokens?: Balance[]; postTokens?: Balance[]; fee?: number; err?: unknown; programs?: string[]; blockTime?: number | null }) {
  const balance = (b: Balance) => ({ accountIndex: b.accountIndex, owner: b.owner, mint: b.mint, uiTokenAmount: { amount: b.amount, decimals: b.decimals, uiAmountString: b.ui ?? (Number(b.amount) / 10 ** b.decimals).toString() }, programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" });
  return {
    slot: 450_000_000 + n, blockTime: options.blockTime === undefined ? 1790323057 : options.blockTime,
    transaction: { signatures: [sig(n)], message: { accountKeys: options.keys.map((k) => ({ signer: false, writable: true, source: "transaction", ...k })), instructions: (options.programs ?? ["system"]).map((program) => ({ program, programId: program })) } },
    meta: { err: options.err ?? null, fee: options.fee ?? 5000, preBalances: options.pre, postBalances: options.post, preTokenBalances: (options.preTokens ?? []).map(balance), postTokenBalances: (options.postTokens ?? []).map(balance) },
  };
}

beforeEach(() => {
  setFeatures({ xstocks: false }); resetActivityCache(); resetTokenMetaCache(); seedMints(`NVDAx:${NVDAX},KALSHI:${KALSHI_MINT},POLYMARKET:${POLYMARKET_MINT}`); setFeatures({ market: false }); setSecrets({ JupiterApiKey: undefined, HeliusApiKey: "test" }); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConfig();
});

describe("real getTransactionsForAddress payloads (test wallet)", () => {
  it("parses the KALSHI and POLYMARKET buys as swaps from balance deltas alone, excluding fee and ATA rent, linked to the bag", async () => {
    const kalshi = await normaliseActivity(kalshiBuy, WALLET, none);
    expect(kalshi).toMatchObject({ signature: kalshiBuy.transaction.signatures[0], ts: new Date(kalshiBuy.blockTime * 1000).toISOString(), kind: "swap", status: "confirmed", summary: "Bought 0.002823 KALSHI for 2.5 USDC", feeLamports: 5000, bagId: "prediction-markets", explorerUrl: `https://solscan.io/tx/${kalshiBuy.transaction.signatures[0]}` });
    expect(kalshi!.legs).toEqual([{ mint: USDC, symbol: "USDC", amount: "2.5", direction: "out" }, { mint: KALSHI_MINT, symbol: "KALSHI", amount: "0.002823375", direction: "in" }]);
    const polymarket = await normaliseActivity(polymarketBuy, WALLET, none);
    expect(polymarket).toMatchObject({ kind: "swap", summary: "Bought 0.016548 POLYMARKET for 2.5 USDC", feeLamports: 5933, bagId: "prediction-markets" });
    expect(polymarket!.legs.map((leg) => leg.mint)).not.toContain(WSOL_MINT);
  });
  it("parses the SOL and USDC deposits as transfer-in with the sender, no fee, and no rent leg even though the sender created the ATA", async () => {
    expect(await normaliseActivity(solDeposit, WALLET, none)).toMatchObject({ kind: "transfer-in", summary: "Received 0.02 SOL from ACv7…Eek5", feeLamports: 0, bagId: null, legs: [{ mint: WSOL_MINT, symbol: "SOL", amount: "0.02", direction: "in" }] });
    expect(await normaliseActivity(usdcDeposit, WALLET, none)).toMatchObject({ kind: "transfer-in", summary: "Received 10 USDC from ACv7…Eek5", feeLamports: 0, legs: [{ mint: USDC, symbol: "USDC", amount: "10", direction: "in" }] });
  });
  it("sees the mirror image from the counterparty's side (a relayer paid its fee) and nothing from an uninvolved wallet", async () => {
    expect(await normaliseActivity(solDeposit, "ACv7o1SgDmRaDeTu3bfyV8rMmnhMdBBQg1VRcq3UEek5", none)).toMatchObject({ kind: "transfer-out", summary: "Sent 0.02 SOL to 6wrV…34Jj", feeLamports: 0 });
    expect(await normaliseActivity(solDeposit, solDeposit.transaction.message.accountKeys[0]!.pubkey, none)).toMatchObject({ kind: "other", legs: [], feeLamports: 10000, summary: "System transaction" });
    expect(await normaliseActivity(kalshiBuy, OTHER, none)).toMatchObject({ kind: "other", legs: [], feeLamports: 0, summary: "Token account setup" });
  });
});

describe("synthetic transactions", () => {
  const solSwap = () => tx(10, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "ata" }, { pubkey: "pool" }], pre: [1_000_000_000, 2_039_280, 0], post: [899_995_000, 2_039_280, 0], preTokens: [{ accountIndex: 1, owner: WALLET, mint: NVDAX, amount: "0", decimals: 8 }], postTokens: [{ accountIndex: 1, owner: WALLET, mint: NVDAX, amount: "50000000", decimals: 8 }] });
  it("treats SOL as a swap leg and labels a non-stable pair as swapped", async () => {
    expect(await normaliseActivity(solSwap(), WALLET, none)).toMatchObject({ kind: "swap", summary: "Bought 0.5 NVDAx for 0.1 SOL", bagId: null, legs: [{ symbol: "SOL", amount: "0.1", direction: "out" }, { symbol: "NVDAx", amount: "0.5", direction: "in" }] });
    const unknownPair = tx(11, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "a" }, { pubkey: "b" }], pre: [0, 0, 0], post: [0, 0, 0], fee: 0, preTokens: [{ accountIndex: 1, owner: WALLET, mint: UNKNOWN, amount: "10", decimals: 0 }], postTokens: [{ accountIndex: 1, owner: WALLET, mint: UNKNOWN, amount: "0", decimals: 0 }, { accountIndex: 2, owner: WALLET, mint: NVDAX, amount: "100000000", decimals: 8 }] });
    expect(await normaliseActivity(unknownPair, WALLET, new Map([[UNKNOWN, { symbol: "WIF", decimals: 0 }]]))).toMatchObject({ summary: "Swapped 10 WIF for 1 NVDAx" });
    expect(await normaliseActivity(unknownPair, WALLET, none)).toMatchObject({ summary: "Swapped 10 5tzF…uAi9 for 1 NVDAx", legs: [{ mint: UNKNOWN, symbol: null, direction: "out" }, { symbol: "NVDAx", direction: "in" }] });
  });
  it("reports failed transactions with the fee the wallet paid and a program label, never balance legs", async () => {
    const failed = tx(12, { ...solSwap(), keys: [{ pubkey: WALLET, signer: true }, { pubkey: "ata" }], pre: [1_000_000_000, 0], post: [999_995_000, 0], err: { InstructionError: [2, { Custom: 6001 }] }, programs: ["ComputeBudget111111111111111111111111111111", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"] });
    expect(await normaliseActivity(failed, WALLET, none)).toMatchObject({ status: "failed", kind: "other", summary: "Failed: Jupiter transaction", legs: [], feeLamports: 5000 });
  });
  it("labels an ATA-create-only transaction as setup (rent and fee are not legs) and closes refund rent silently", async () => {
    const create = tx(13, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "ata" }], pre: [10_000_000, 0], post: [7_955_720, 2_039_280], programs: ["spl-associated-token-account"], postTokens: [{ accountIndex: 1, owner: WALLET, mint: NVDAX, amount: "0", decimals: 8 }] });
    expect(await normaliseActivity(create, WALLET, none)).toMatchObject({ kind: "other", status: "confirmed", summary: "Token account setup", legs: [], feeLamports: 5000 });
    const close = tx(14, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "ata" }], pre: [7_955_720, 2_039_280], post: [9_990_000, 0], programs: ["spl-token"], preTokens: [{ accountIndex: 1, owner: WALLET, mint: NVDAX, amount: "0", decimals: 8 }] });
    expect(await normaliseActivity(close, WALLET, none)).toMatchObject({ kind: "other", summary: "Token program interaction", legs: [] });
    expect(walletChanges(create, WALLET).changes).toEqual([]);
  });
  it("uses uiAmountString so Token-2022 scaled-UI mints are already in wallet units, and ignores SOL dust next to token legs", async () => {
    const scaled = tx(15, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "ata" }, { pubkey: "usdc" }], pre: [1_000_000, 0, 0], post: [990_000, 0, 0], preTokens: [{ accountIndex: 2, owner: WALLET, mint: USDC, amount: "5000000", decimals: 6 }], postTokens: [{ accountIndex: 1, owner: WALLET, mint: UNKNOWN, amount: "1000000000", decimals: 9, ui: "1.486" }, { accountIndex: 2, owner: WALLET, mint: USDC, amount: "0", decimals: 6 }] });
    expect(await normaliseActivity(scaled, WALLET, none)).toMatchObject({ kind: "swap", summary: "Bought 1.486 5tzF…uAi9 for 5 USDC", legs: [{ amount: "5", direction: "out" }, { amount: "1.486", direction: "in" }] });
  });
  it("classifies multi-leg transactions as other with an honest summary, rejects malformed items, and handles a null blockTime", async () => {
    const multi = tx(16, { keys: [{ pubkey: WALLET, signer: true }, { pubkey: "a" }, { pubkey: "b" }, { pubkey: "c" }], pre: [0, 0, 0, 0], post: [0, 0, 0, 0], fee: 0, blockTime: null,
      preTokens: [{ accountIndex: 1, owner: WALLET, mint: USDC, amount: "3000000", decimals: 6 }], postTokens: [{ accountIndex: 1, owner: WALLET, mint: USDC, amount: "0", decimals: 6 }, { accountIndex: 2, owner: WALLET, mint: NVDAX, amount: "100000000", decimals: 8 }, { accountIndex: 3, owner: WALLET, mint: KALSHI_MINT, amount: "1000000000", decimals: 9 }] });
    expect(await normaliseActivity(multi, WALLET, none)).toMatchObject({ kind: "other", ts: null, summary: "Sent 3 USDC; received 1 NVDAx, 1 KALSHI", bagId: null });
    expect(await normaliseActivity({ transaction: { signatures: ["nope"] } }, WALLET, none)).toBeNull();
    expect(await normaliseActivity("garbage", WALLET, none)).toBeNull();
  });
  it("formats amounts and parses decimals exactly", () => {
    expect(formatAmount("5")).toBe("5"); expect(formatAmount("0.02100000")).toBe("0.021"); expect(formatAmount("1.23456789")).toBe("1.234567"); expect(formatAmount("0.000000123")).toBe("0.000000123");
    expect(decimalToAtomic("1.486", 9)).toBe(1486000000n); expect(decimalToAtomic("2.5", 6)).toBe(2500000n); expect(decimalToAtomic("1.2345678", 6)).toBeNull(); expect(decimalToAtomic("-1", 6)).toBeNull();
  });
});

describe("readActivity", () => {
  it("returns typed errors when the wallet, Helius or cursor is invalid", async () => {
    expect(await readActivity(null, undefined, 20)).toEqual({ ok: false, error: { code: "NO_WALLET", message: "No verified Solana wallet linked to this Privy identity" } });
    expect(await readActivity(WALLET, "abc", 20)).toEqual({ ok: false, error: { code: "INVALID_CURSOR", message: "Invalid activity cursor" } });
    setSecrets({ HeliusApiKey: undefined });
    expect(await readActivity(WALLET, undefined, 20)).toEqual({ ok: false, error: { code: "PROVIDER_NOT_CONFIGURED", message: "Helius is not configured" } });
  });
  it("calls getTransactionsForAddress with Helius' pagination token as cursor, resolves unknown symbols once per page, and caches 30s", async () => {
    setSecrets({ JupiterApiKey: "jup" });
    const calls: { method: string; params?: unknown }[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "api.jup.ag") { calls.push({ method: "jupiter" }); expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("jup"); return Response.json([{ id: UNKNOWN, symbol: "WIF", name: "dogwifhat", decimals: 0, usdPrice: 0.5 }]); }
      expect(url.hostname).toBe("mainnet.helius-rpc.com");
      expect(url.searchParams.get("api-key")).toBe("test");
      const body = JSON.parse(String(init?.body)) as { method: string; params: [string, Record<string, unknown>] };
      calls.push({ method: body.method, params: body.params[1] });
      expect(body.params[0]).toBe(WALLET);
      expect(body.params[1]).toMatchObject({ transactionDetails: "full", encoding: "jsonParsed", maxSupportedTransactionVersion: 1, limit: 2, sortOrder: "desc", commitment: "confirmed", filters: { tokenAccounts: "balanceChanged" } });
      if (!body.params[1].paginationToken) return Response.json({ jsonrpc: "2.0", id: 1, result: { data: [kalshiBuy, tx(20, { keys: [{ pubkey: OTHER, signer: true }, { pubkey: "a" }], pre: [0, 0], post: [0, 0], preTokens: [], postTokens: [{ accountIndex: 1, owner: WALLET, mint: UNKNOWN, amount: "2", decimals: 0 }] })], paginationToken: "450291856:69" } });
      expect(body.params[1].paginationToken).toBe("450291856:69");
      return Response.json({ jsonrpc: "2.0", id: 1, result: { data: [solDeposit], paginationToken: null } });
    }) as unknown as typeof fetch;
    const first = await readActivity(WALLET, undefined, 2);
    expect(first.ok && first.value.items.map((item) => item.summary)).toEqual(["Bought 0.002823 KALSHI for 2.5 USDC", "Received 2 WIF"]);
    expect(first.ok && first.value.nextCursor).toBe("450291856:69");
    expect(calls.map((call) => call.method)).toEqual(["getTransactionsForAddress", "jupiter"]);
    expect(await readActivity(WALLET, undefined, 2)).toEqual(first);
    expect(calls.filter((call) => call.method === "getTransactionsForAddress")).toHaveLength(1);
    const second = await readActivity(WALLET, "450291856:69", 2);
    expect(second.ok && second.value.items.map((item) => item.kind)).toEqual(["transfer-in"]);
    expect(second.ok && second.value.nextCursor).toBeNull();
  });
  it("maps Helius' invalid-token error and provider failures to typed errors without caching them", async () => {
    globalThis.fetch = mock(async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Bad request: Invalid pagination token" } })) as unknown as typeof fetch;
    expect(await readActivity(WALLET, "1:1", 20)).toEqual({ ok: false, error: { code: "INVALID_CURSOR", message: "Invalid activity cursor" } });
    let status = 503;
    globalThis.fetch = mock(async () => status === 200 ? Response.json({ jsonrpc: "2.0", id: 1, result: { data: [solDeposit], paginationToken: null } }) : new Response("down", { status })) as unknown as typeof fetch;
    expect(await readActivity(WALLET, undefined, 20)).toEqual({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Activity provider unavailable" } });
    status = 200;
    const result = await readActivity(WALLET, undefined, 20);
    expect(result.ok && result.value.items).toHaveLength(1);
  });
  it("normalisePage passes the cursor through and drops junk items", async () => {
    const page = await normalisePage([usdcDeposit, "junk", { transaction: {} }], WALLET, "1:2");
    expect(page.items.map((item) => item.kind)).toEqual(["transfer-in"]);
    expect(page.nextCursor).toBe("1:2");
  });
});
