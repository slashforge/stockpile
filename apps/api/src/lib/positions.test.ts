import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "6wrVmCmxorXZhjQaWnPANgMsxaQ7SZHjB5gG7YiE34Jj";
const OTHER = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", MSFTX = "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const sig = (n: number) => `${n.toString().replace(/0/g, "z")}${"5".repeat(87 - String(n).length)}`;

// In-memory lot store: positions.ts never sees Drizzle, so the store is mocked wholesale.
type Row = { id: string; userId: string; bagId: string; walletAddress: string; mint: string; symbol: string; side: "buy" | "sell"; tokenAmount: string; decimals: number; usdcAmount: string; signature: string; slot: number | null; blockTime: Date | null; createdAt: Date };
let rows: Row[] = [];
mock.module("./lots-store", () => ({
  findLotBySignature: async (signature: string) => rows.find((row) => row.signature === signature) ?? null,
  listLots: async (userId: string) => rows.filter((row) => row.userId === userId),
  hasBuyLot: async (userId: string, bagId: string, mint: string) => rows.find((row) => row.userId === userId && row.bagId === bagId && row.mint === mint && row.side === "buy") ?? null,
  insertLot: async (values: Omit<Row, "createdAt">) => { if (rows.some((row) => row.signature === values.signature)) return null; const row = { ...values, createdAt: new Date() }; rows.push(row); return row; },
  lotLinks: async (userId: string, signatures: string[]) => new Map(rows.filter((row) => row.userId === userId && signatures.includes(row.signature)).map((row) => [row.signature, row.bagId])),
}));

const { aggregateLots, applyBagLinks, parseSwap, readPositions, recordLeg } = await import("./positions");
const { quoteBag } = await import("./trade");
const { findBag } = await import("./bags");
const { resetTokenMetaCache } = await import("./token-meta");
const { resetMarketCache } = await import("./market");

type Balance = { accountIndex: number; owner: string; mint: string; amount: string; decimals: number; ui?: string };
/** Synthetic jsonParsed transaction in the real Helius shape: fee payer first, token balances owner-tagged. */
function swapTx(n: number, options: { feePayer?: string; pre: Balance[]; post: Balance[]; err?: unknown; blockTime?: number }) {
  const balance = (b: Balance) => ({ accountIndex: b.accountIndex, owner: b.owner, mint: b.mint, uiTokenAmount: { amount: b.amount, decimals: b.decimals, uiAmountString: b.ui ?? (Number(b.amount) / 10 ** b.decimals).toString() }, programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" });
  const keys = [options.feePayer ?? WALLET, OTHER, "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "11111111111111111111111111111111", "22222222222222222222222222222222"];
  return { slot: 450_000_000 + n, blockTime: options.blockTime ?? 1790323057, transaction: { signatures: [sig(n)], message: { accountKeys: keys.map((pubkey) => ({ pubkey, signer: false, writable: true, source: "transaction" })), instructions: [{ program: "jupiter", programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" }] } },
    meta: { err: options.err ?? null, fee: 5000, preBalances: [1_000_000_000, 0, 0, 0, 0], postBalances: [999_995_000, 0, 0, 0, 0], preTokenBalances: options.pre.map(balance), postTokenBalances: options.post.map(balance) } };
}
const buyTx = (n: number, mint: string, usdcOut: string, tokenIn: string, decimals = 8) => swapTx(n, {
  pre: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "10000000", decimals: 6 }, { accountIndex: 4, owner: WALLET, mint, amount: "0", decimals }],
  post: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: String(10000000 - Number(usdcOut)), decimals: 6 }, { accountIndex: 4, owner: WALLET, mint, amount: tokenIn, decimals }],
});
const sellTx = (n: number, mint: string, tokenOut: string, usdcIn: string, decimals = 8) => swapTx(n, {
  pre: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "0", decimals: 6 }, { accountIndex: 4, owner: WALLET, mint, amount: tokenOut, decimals }],
  post: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: usdcIn, decimals: 6 }, { accountIndex: 4, owner: WALLET, mint, amount: "0", decimals }],
});
const identity = { id: "user-a", walletAddress: WALLET };
const originalFetch = globalThis.fetch;
const original = Object.fromEntries(["HELIUS_API_KEY", "JUPITER_API_KEY", "STOCKPILE_ALLOWED_MINTS", "STOCKPILE_MARKET", "STOCKPILE_PRESTOCKS"].map((key) => [key, process.env[key]]));
const tokenAccount = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals, uiAmountString: (Number(amount) / 10 ** decimals).toString() } } } } } });

/** Mocks Helius (getTransaction by signature, getTokenAccountsByOwner balances) and Jupiter (token metadata, quotes). */
function providers(options: { txs?: Record<string, unknown>; balances?: Record<string, string>; prices?: Record<string, number>; heliusDown?: boolean; quote?: (url: URL) => Response }) {
  const requests: { method?: string; url: string }[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "mainnet.helius-rpc.com") {
      if (options.heliusDown) return new Response("down", { status: 503 });
      const body = JSON.parse(String(init?.body));
      if (Array.isArray(body)) {
        requests.push({ method: "batch", url: url.hostname });
        const accounts = Object.entries(options.balances ?? {}).map(([mint, amount]) => tokenAccount(mint, amount, mint === USDC ? 6 : 8));
        return Response.json([{ id: 1, result: { value: 1_000_000 } }, { id: 2, result: { value: accounts.filter((a) => a.account.data.parsed.info.mint === USDC) } }, { id: 3, result: { value: accounts.filter((a) => a.account.data.parsed.info.mint !== USDC) } }]);
      }
      requests.push({ method: body.method, url: url.hostname });
      expect(body.params[1]).toMatchObject({ encoding: "jsonParsed", maxSupportedTransactionVersion: 1 });
      return Response.json({ jsonrpc: "2.0", id: 1, result: options.txs?.[body.params[0]] ?? null });
    }
    if (url.pathname.startsWith("/tokens/v2/search")) {
      requests.push({ method: "tokens", url: url.pathname });
      return Response.json(url.searchParams.get("query")!.split(",").map((id) => ({ id, symbol: id.slice(0, 5), name: id, decimals: id === USDC ? 6 : 8, icon: `https://img.example/${id}.png`, usdPrice: options.prices?.[id] ?? null })));
    }
    if (url.pathname.endsWith("/quote")) { requests.push({ method: "quote", url: url.search }); return options.quote ? options.quote(url) : new Response("no", { status: 500 }); }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return requests;
}

beforeEach(() => {
  rows = []; resetTokenMetaCache(); resetMarketCache();
  process.env.HELIUS_API_KEY = "test"; process.env.JUPITER_API_KEY = "test"; process.env.STOCKPILE_MARKET = "0"; process.env.STOCKPILE_PRESTOCKS = "0";
  process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX},MSFTx:${MSFTX},NVDAx:${NVDAX}`;
});
afterEach(() => { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

describe("parseSwap", () => {
  it("infers side and raw amounts from the wallet's own balance deltas, using the scaled UI amount for display", () => {
    const buy = parseSwap(buyTx(1, NVDAX, "1000000", "440000"), WALLET);
    expect(buy).toEqual({ ok: true, value: { side: "buy", mint: NVDAX, tokenAmount: 440000n, decimals: 8, tokenUiAmount: 0.0044, usdcAmount: 1000000n } });
    const sell = parseSwap(sellTx(2, NVDAX, "440000", "990000"), WALLET);
    expect(sell).toEqual({ ok: true, value: { side: "sell", mint: NVDAX, tokenAmount: 440000n, decimals: 8, tokenUiAmount: 0.0044, usdcAmount: 990000n } });
    // Token-2022 scaled-UI mint: the RPC's uiAmountString is 10x the raw units; raw stays the sellable amount, UI follows the wallet.
    const scaled = swapTx(3, { pre: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "5000000", decimals: 6 }, { accountIndex: 4, owner: WALLET, mint: NVDAX, amount: "0", decimals: 8, ui: "0" }],
      post: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "0", decimals: 6 }, { accountIndex: 4, owner: WALLET, mint: NVDAX, amount: "1367737", decimals: 8, ui: "0.1367737" }] });
    expect(parseSwap(scaled, WALLET)).toMatchObject({ ok: true, value: { tokenAmount: 1367737n, tokenUiAmount: 0.1367737, usdcAmount: 5000000n } });
  });
  it("rejects failed transactions, other fee payers, non-swaps and token-to-token swaps with typed codes", () => {
    expect(parseSwap({ ...buyTx(1, NVDAX, "1000000", "440000"), meta: { ...buyTx(1, NVDAX, "1000000", "440000").meta, err: { InstructionError: [0, "Custom"] } } }, WALLET)).toMatchObject({ ok: false, code: "TRANSACTION_FAILED" });
    expect(parseSwap(buyTx(1, NVDAX, "1000000", "440000"), OTHER)).toMatchObject({ ok: false, code: "NOT_YOUR_TRANSACTION" });
    expect(parseSwap(swapTx(4, { feePayer: OTHER, pre: [], post: [] }), WALLET)).toMatchObject({ ok: false, code: "NOT_YOUR_TRANSACTION" });
    expect(parseSwap(swapTx(5, { pre: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "0", decimals: 6 }], post: [{ accountIndex: 3, owner: WALLET, mint: USDC, amount: "100", decimals: 6 }] }), WALLET)).toMatchObject({ ok: false, code: "NOT_A_SWAP" });
    expect(parseSwap(swapTx(6, { pre: [{ accountIndex: 3, owner: WALLET, mint: AAPLX, amount: "100", decimals: 8 }, { accountIndex: 4, owner: WALLET, mint: NVDAX, amount: "0", decimals: 8 }], post: [{ accountIndex: 3, owner: WALLET, mint: AAPLX, amount: "0", decimals: 8 }, { accountIndex: 4, owner: WALLET, mint: NVDAX, amount: "50", decimals: 8 }] }), WALLET)).toMatchObject({ ok: false, code: "NOT_A_SWAP" });
  });
});

describe("recordLeg", () => {
  it("links a confirmed buy from chain data, is idempotent by signature, and refuses relinking to another bag", async () => {
    const requests = providers({ txs: { [sig(1)]: buyTx(1, NVDAX, "1500000", "660000") } });
    const first = await recordLeg(identity, "megacap-builders", sig(1));
    expect(first).toMatchObject({ status: 200, lot: { bagId: "megacap-builders", mint: NVDAX, symbol: "NVDAx", side: "buy", tokenAmount: "660000", tokenUiAmount: 0.0066, decimals: 8, usdcAmount: "1500000", usdcUiAmount: 1.5, signature: sig(1), ts: new Date(1790323057 * 1000).toISOString() } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "user-a", walletAddress: WALLET, slot: 450_000_001 });
    expect(await recordLeg(identity, "megacap-builders", sig(1))).toEqual(first);
    expect(requests.filter((r) => r.method === "getTransaction")).toHaveLength(1); // the replay never re-fetches
    expect(await recordLeg(identity, "ai-infrastructure", sig(1))).toMatchObject({ status: 409, code: "SIGNATURE_ALREADY_LINKED", bagId: "megacap-builders" });
    expect(await recordLeg({ id: "user-b", walletAddress: OTHER }, "megacap-builders", sig(1))).toMatchObject({ status: 400, code: "NOT_YOUR_TRANSACTION" });
  });
  it("returns 202 while the transaction is unknown, 404 for unknown bags, 503 without a provider, and typed 400s", async () => {
    providers({ txs: { [sig(2)]: buyTx(2, AAPLX, "1000000", "300000"), [sig(3)]: { ...buyTx(3, NVDAX, "1", "1"), meta: { ...buyTx(3, NVDAX, "1", "1").meta, err: {} } } } });
    expect(await recordLeg(identity, "megacap-builders", sig(9))).toEqual({ status: 202 });
    expect(await recordLeg(identity, "nope", sig(1))).toMatchObject({ status: 404 });
    expect(await recordLeg({ id: "user-a", walletAddress: null }, "megacap-builders", sig(1))).toMatchObject({ status: 400, code: "NOT_YOUR_TRANSACTION" });
    expect(await recordLeg(identity, "crypto-fintech-rails", sig(2))).toMatchObject({ status: 400, code: "MINT_NOT_IN_BAG" }); // AAPLx is not in that bag
    expect(await recordLeg(identity, "megacap-builders", sig(3))).toMatchObject({ status: 400, code: "TRANSACTION_FAILED" });
    expect(rows).toHaveLength(0);
    delete process.env.HELIUS_API_KEY;
    expect(await recordLeg(identity, "megacap-builders", sig(2))).toMatchObject({ status: 503, code: "PROVIDER_NOT_CONFIGURED" });
    process.env.HELIUS_API_KEY = "test"; providers({ heliusDown: true });
    expect(await recordLeg(identity, "megacap-builders", sig(2))).toMatchObject({ status: 503, code: "PROVIDER_UNAVAILABLE" });
  });
  it("accepts a sell of a mint that left the bag when the user bought it into this bag earlier", async () => {
    providers({ txs: { [sig(4)]: buyTx(4, NVDAX, "1000000", "440000"), [sig(5)]: sellTx(5, NVDAX, "440000", "1010000") } });
    expect(await recordLeg(identity, "megacap-builders", sig(4))).toMatchObject({ status: 200 });
    process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${AAPLX}`; // NVDAx no longer resolves in the bag
    expect(await recordLeg(identity, "megacap-builders", sig(5))).toMatchObject({ status: 200, lot: { side: "sell", symbol: "NVDAx", tokenAmount: "440000", usdcAmount: "1010000" } });
    expect(await recordLeg(identity, "ai-infrastructure", sig(5))).toMatchObject({ status: 409 });
  });
});

describe("positions", () => {
  const lot = (over: Partial<Row>): Row => ({ id: `lot_${rows.length}`, userId: "user-a", bagId: "megacap-builders", walletAddress: WALLET, mint: NVDAX, symbol: "NVDAx", side: "buy", tokenAmount: "0", decimals: 8, usdcAmount: "0", signature: sig(100 + rows.length), slot: null, blockTime: new Date("2026-09-20T00:00:00Z"), createdAt: new Date() , ...over });
  it("nets lots per (bag, mint), floors at zero, and omits bags that are fully sold", () => {
    rows = [lot({ tokenAmount: "1000", usdcAmount: "300" }), lot({ tokenAmount: "1000", usdcAmount: "310" }), lot({ side: "sell", tokenAmount: "1500", usdcAmount: "500" }), lot({ mint: AAPLX, symbol: "AAPLx", tokenAmount: "10", usdcAmount: "40" }), lot({ bagId: "cloud-software", mint: MSFTX, symbol: "MSFTx", side: "sell", tokenAmount: "5", usdcAmount: "9" })];
    const byBag = aggregateLots(rows);
    expect(byBag.get("megacap-builders")!.get(NVDAX)).toMatchObject({ tracked: 500n, costUsdc: 110n, lots: 3 });
    expect(byBag.get("megacap-builders")!.get(AAPLX)).toMatchObject({ tracked: 10n, costUsdc: 40n, lots: 1 });
    expect(byBag.get("cloud-software")!.get(MSFTX)).toMatchObject({ tracked: 0n, costUsdc: -9n });
  });
  it("reconciles tracked amounts against wallet balances (proportional cap across bags), prices legs and computes P&L", async () => {
    rows = [lot({ tokenAmount: "600000", usdcAmount: "1500000" }), lot({ bagId: "ai-infrastructure", tokenAmount: "400000", usdcAmount: "1000000", blockTime: new Date("2026-09-22T00:00:00Z") }), lot({ mint: AAPLX, symbol: "AAPLx", tokenAmount: "300000", usdcAmount: "1000000" }), lot({ bagId: "cloud-software", mint: MSFTX, symbol: "MSFTx", side: "sell", tokenAmount: "5", usdcAmount: "9" })];
    // Wallet holds 500000 NVDAx against 1000000 tracked across two bags -> each bag capped to half; AAPLx fully covered.
    const requests = providers({ balances: { [NVDAX]: "500000", [AAPLX]: "300000", [USDC]: "1000" }, prices: { [NVDAX]: 250, [AAPLX]: 400 } });
    const result = await readPositions(identity);
    expect(result).toMatchObject({ walletAddress: WALLET, status: "live" });
    expect(result.bags.map((bag) => bag.bagId)).toEqual(["megacap-builders", "ai-infrastructure"]); // cloud-software is fully sold -> omitted; catalogue order
    const megacap = result.bags[0]!;
    expect(megacap.legs).toEqual([
      { mint: NVDAX, symbol: "NVDAx", iconUrl: `https://img.example/${NVDAX}.png`, decimals: 8, tracked: "600000", trackedUi: 0.006, walletBalance: "500000", held: "300000", heldUi: 0.003, usdPrice: 250, usdValue: 0.75, costUsdc: 1.5 },
      { mint: AAPLX, symbol: "AAPLx", iconUrl: `https://img.example/${AAPLX}.png`, decimals: 8, tracked: "300000", trackedUi: 0.003, walletBalance: "300000", held: "300000", heldUi: 0.003, usdPrice: 400, usdValue: 1.2, costUsdc: 1 },
    ]);
    expect(megacap).toMatchObject({ title: "Megacap Builders", costUsdc: 2.5, valueUsd: 1.95, pnlUsd: -0.55, pnlPct: -22, reconciled: false, sellable: true, lotCount: 2, lastTradedAt: "2026-09-20T00:00:00.000Z" });
    expect(result.bags[1]).toMatchObject({ bagId: "ai-infrastructure", costUsdc: 1, valueUsd: 0.5, pnlUsd: -0.5, pnlPct: -50, reconciled: false, lotCount: 1, lastTradedAt: "2026-09-22T00:00:00.000Z", legs: [{ tracked: "400000", held: "200000" }] });
    expect(requests.filter((r) => r.method === "batch")).toHaveLength(1); // one Helius balance batch, shared with the portfolio code path
    expect(requests.filter((r) => r.method === "tokens")).toHaveLength(1);
  });
  it("is explicitly unavailable (held = tracked, balances null, not sellable) when balances cannot be read; valueUsd null when a leg is unpriced", async () => {
    rows = [lot({ tokenAmount: "600000", usdcAmount: "1500000" })];
    providers({ heliusDown: true });
    let result = await readPositions(identity);
    expect(result).toMatchObject({ status: "unavailable", message: "Holdings provider unavailable", bags: [{ bagId: "megacap-builders", reconciled: true, sellable: false, valueUsd: null, pnlUsd: null, pnlPct: null, legs: [{ tracked: "600000", held: "600000", walletBalance: null, usdValue: null }] }] });
    providers({ balances: { [NVDAX]: "600000" } }); // no price
    result = await readPositions(identity);
    expect(result).toMatchObject({ status: "live", bags: [{ reconciled: true, sellable: true, valueUsd: null, pnlUsd: null, legs: [{ held: "600000", usdPrice: null, usdValue: null }] }] });
    expect(await readPositions({ id: "user-a", walletAddress: null })).toMatchObject({ status: "unavailable", bags: [] });
    rows = [];
    expect(await readPositions(identity)).toEqual({ walletAddress: WALLET, status: "live", bags: [] });
  });
  it("overrides guessed activity bag ids with the user's own lots", async () => {
    rows = [lot({ bagId: "ai-infrastructure", signature: sig(7) })];
    const item = { signature: sig(7), ts: null, kind: "swap" as const, status: "confirmed" as const, summary: "", legs: [], feeLamports: 0, bagId: "megacap-builders", bagLinked: false, explorerUrl: "" };
    const page = await applyBagLinks({ items: [item, { ...item, signature: sig(8) }], nextCursor: null, asOf: "" }, "user-a");
    expect(page.items.map((it) => [it.bagId, it.bagLinked])).toEqual([["ai-infrastructure", true], ["megacap-builders", false]]);
  });
});

describe("sell quotes", () => {
  const quoteFor = (url: URL) => Response.json({ inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: String(Math.floor(Number(url.searchParams.get("amount")) / 100)), otherAmountThreshold: "1", slippageBps: 50, priceImpactPct: "0.002", routePlan: [{}] });
  const lot = (over: Partial<Row>): Row => ({ id: `lot_${rows.length}`, userId: "user-a", bagId: "megacap-builders", walletAddress: WALLET, mint: NVDAX, symbol: "NVDAx", side: "buy", tokenAmount: "0", decimals: 8, usdcAmount: "0", signature: sig(100 + rows.length), slot: null, blockTime: null, createdAt: new Date(), ...over });
  const context = { userId: "user-a", walletAddress: WALLET };
  it("sells floor(held * portionBps / 10000) of every held leg for USDC, all-or-nothing", async () => {
    rows = [lot({ tokenAmount: "600000", usdcAmount: "1500000" }), lot({ mint: AAPLX, symbol: "AAPLx", tokenAmount: "300001", usdcAmount: "1000000" })];
    const requests = providers({ balances: { [NVDAX]: "600000", [AAPLX]: "300001" }, prices: { [NVDAX]: 250, [AAPLX]: 400 }, quote: quoteFor });
    const result = await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 5000, slippageBps: 50 }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.legs.map((leg) => [leg.asset.symbol, leg.inputMint, leg.outputMint, leg.amount, leg.outputDecimals, leg.asset.weightBps])).toEqual([[ "NVDAx", NVDAX, USDC, 300000n, 6, findBag("megacap-builders")!.assets.find((a) => a.symbol === "NVDAx")!.weightBps ], ["AAPLx", AAPLX, USDC, 150000n, 6, 1800]]);
    expect(result.value.quotes.map((quote) => quote.outAmount)).toEqual(["3000", "1500"]);
    expect(requests.filter((r) => r.method === "quote").map((r) => r.url)).toEqual([`?inputMint=${NVDAX}&outputMint=${USDC}&amount=300000&slippageBps=50&restrictIntermediateTokens=true`, `?inputMint=${AAPLX}&outputMint=${USDC}&amount=150000&slippageBps=50&restrictIntermediateTokens=true`]);
    // Wallet holds less than tracked: the sell uses the reconciled `held`, never the tracked amount.
    providers({ balances: { [NVDAX]: "100000", [AAPLX]: "300001" }, quote: quoteFor });
    const capped = await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 50 }, context);
    expect(capped.ok && capped.value.legs.map((leg) => leg.amount)).toEqual([100000n, 300001n]);
  });
  it("fails closed: no position, a leg rounding to zero, unavailable balances, missing identity or portion, and buys still need USDC + amount", async () => {
    providers({ balances: {}, quote: quoteFor });
    expect(await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 50 }, context)).toMatchObject({ ok: false, error: { code: "NO_POSITION" } });
    rows = [lot({ tokenAmount: "600000", usdcAmount: "1500000" }), lot({ mint: AAPLX, symbol: "AAPLx", tokenAmount: "3", usdcAmount: "1" })];
    providers({ balances: { [NVDAX]: "600000", [AAPLX]: "3" }, quote: quoteFor });
    expect(await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 1000, slippageBps: 50 }, context)).toMatchObject({ ok: false, error: { code: "AMOUNT_TOO_SMALL", symbol: "AAPLx", legIndex: 1 } });
    providers({ balances: { [AAPLX]: "3" }, quote: quoteFor }); // NVDAx balance gone -> held 0 -> that leg is skipped, AAPLx alone is sold
    const partial = await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 50 }, context);
    expect(partial.ok && partial.value.legs.map((leg) => [leg.asset.symbol, leg.amount])).toEqual([["AAPLx", 3n]]);
    providers({ heliusDown: true }); // balances unknown -> never sell against unverified amounts
    expect(await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 50 }, context)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR", message: "Holdings provider unavailable" } });
    expect(await quoteBag({ bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 50 }, null)).toMatchObject({ ok: false, error: { code: "NO_WALLET" } });
    expect(await quoteBag({ bagId: "megacap-builders", side: "sell", slippageBps: 50 }, context)).toMatchObject({ ok: false, error: { code: "AMOUNT_TOO_SMALL" } });
    expect(await quoteBag({ bagId: "megacap-builders", side: "buy", inputMint: USDC, slippageBps: 50 }, context)).toMatchObject({ ok: false, error: { code: "AMOUNT_TOO_SMALL" } });
  });
});
