import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { resetActivityCache } from "../lib/activity";
import { resetTokenMetaCache } from "../lib/token-meta";
import { resetMintRegistry, seedMints } from "../lib/mint-registry";
import { SENDER_TIP_ACCOUNTS, SENDER_TIP_LAMPORTS } from "../lib/sponsor";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "11111111111111111111111111111111";
const OTHER_WALLET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mints = { AAPLx: "22222222222222222222222222222222", MSFTx: "33333333333333333333333333333333", NVDAx: "44444444444444444444444444444444" };
const saved = new Map<string, Set<string>>();
let insertedUser: string | undefined;
let deleted = false;
const requestBody = { bagId: "megacap-builders", inputMint: USDC, amount: "1000000" };
const PAYMASTER = Keypair.generate();
const PAYER = PAYMASTER.publicKey.toBase58();
const JUP = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

mock.module("../lib/identity", () => ({
  verifyIdentity: async (token: string) => token === "valid" || token === "no-wallet" || token === "other"
    ? { id: token === "other" ? "user-b" : "user-a", email: "verified@example.com", walletAddress: token === "no-wallet" ? null : WALLET }
    : null,
  syncUser: async (identity: { id: string; email: string; walletAddress: string | null }) => {
    insertedUser = identity.id;
    return { ...identity, createdAt: "2026-01-01T00:00:00.000Z" };
  },
}));
// Bag lots: in-memory store keyed by signature (see lib/positions.test.ts for the position maths; here only the HTTP contract).
type Lot = { id: string; userId: string; bagId: string; walletAddress: string; mint: string; symbol: string; side: "buy" | "sell"; tokenAmount: string; decimals: number; usdcAmount: string; signature: string; slot: number | null; blockTime: Date | null; createdAt: Date };
const lots: Lot[] = [];
mock.module("../lib/lots-store", () => ({
  findLotBySignature: async (signature: string) => lots.find((lot) => lot.signature === signature) ?? null,
  listLots: async (userId: string) => lots.filter((lot) => lot.userId === userId),
  hasBuyLot: async () => null,
  insertLot: async (values: Omit<Lot, "createdAt">) => { if (lots.some((lot) => lot.signature === values.signature)) return null; const lot = { ...values, createdAt: new Date() }; lots.push(lot); return lot; },
  lotLinks: async (userId: string, signatures: string[]) => new Map(lots.filter((lot) => lot.userId === userId && signatures.includes(lot.signature)).map((lot) => [lot.signature, lot.bagId])),
}));
mock.module("@stockpile/core/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: (expression: unknown) => {
      // Drizzle SQL expressions are exercised; the mock only simulates the single test user.
      void expression;
      return Array.from(saved.get(currentUser) ?? []).map((bagId) => ({ bagId }));
    } }) }),
    insert: () => ({ values: ({ userId, bagId }: { userId: string; bagId: string }) => ({
      onConflictDoNothing: async () => { saved.set(userId, (saved.get(userId) ?? new Set()).add(bagId)); },
    }) }),
    delete: () => ({ where: async (_expression: unknown) => { deleted = true; saved.get(currentUser)?.delete("megacap-builders"); } }),
  },
}));

let currentUser = "user-a";
const { default: account } = await import("./account");
// Trade expectations below assume the classic three-leg 35/35/30 Megacap Builders; pin that composition for this file only.
const { findBag } = await import("../lib/bags");
const megacap = findBag("megacap-builders")!;
const catalogueAssets = megacap.assets;
megacap.assets = [
  { symbol: "AAPLx", underlyingTicker: "AAPL", name: "Apple xStock", weightBps: 3500, sourceUrl: "https://xstocks.fi/products" },
  { symbol: "MSFTx", underlyingTicker: "MSFT", name: "Microsoft xStock", weightBps: 3500, sourceUrl: "https://xstocks.fi/products" },
  { symbol: "NVDAx", underlyingTicker: "NVDA", name: "NVIDIA xStock", weightBps: 3000, sourceUrl: "https://xstocks.fi/products" },
];
afterAll(() => { megacap.assets = catalogueAssets; });
const app = new Hono();
app.route("/", account);
const originalFetch = globalThis.fetch;
const original = Object.fromEntries(["PRIVY_APP_ID", "PRIVY_APP_SECRET", "JUPITER_API_KEY", "HELIUS_API_KEY", "STOCKPILE_XSTOCKS", "STOCKPILE_PRESTOCKS", "SOLANA_PAYMASTER_KEY"].map((key) => [key, process.env[key]]));

function auth(token = "valid") { currentUser = token === "other" ? "user-b" : "user-a"; return { "privy-id-token": token }; }
function post(path: string, body: unknown, token = "valid") { return app.request(path, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function json(response: Response | Promise<Response>) { return (await response).json() as Promise<any>; }
function allMints() { seedMints(Object.entries(mints).map(([symbol, mint]) => `${symbol}:${mint}`).join(",")); }
const quoteFor = (url: URL, extra: Record<string, unknown> = {}) => Response.json({ inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: "42", otherAmountThreshold: "41", slippageBps: Number(url.searchParams.get("slippageBps")), priceImpactPct: "0.001", routePlan: [{}], ...extra });
const ix = (programId: string, accounts: [string, boolean, boolean][], data = [1, 2, 3]) => ({ programId, accounts: accounts.map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })), data: Buffer.from(data).toString("base64") });
const cuPrice = (microLamports: bigint) => { const data = Buffer.alloc(9); data.writeUInt8(3, 0); data.writeBigUInt64LE(microLamports, 1); return ix("ComputeBudget111111111111111111111111111111", [], [...data]); };
/** A Jupiter `/swap/v2/build` response for the requested leg: the taker signs the swap, the paymaster funds rent. */
const buildFor = (url: URL, extra: Record<string, unknown> = {}) => Response.json({
  inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: "42", otherAmountThreshold: "41", slippageBps: 37, priceImpactPct: "0.001", routePlan: [{}],
  computeBudgetInstructions: [cuPrice(50_000_000n)], setupInstructions: [], cleanupInstruction: null, otherInstructions: [],
  swapInstruction: ix(JUP, [[url.searchParams.get("taker")!, true, false], [url.searchParams.get("payer")!, true, true], [USDC, false, true]]),
  addressesByLookupTableAddress: null, blockhashWithMetadata: { blockhash: new Array(32).fill(7), lastValidBlockHeight: 123 }, ...extra });
type Simulation = { err?: unknown; logs?: string[]; unitsConsumed?: number; spent?: number };
/** Helius JSON-RPC for the paymaster: balance + simulation. Returns null for anything else. */
function sponsorRpc(body: any, simulation: Simulation = {}, simulated: string[] = []) {
  if (body?.method === "getBalance") return Response.json({ jsonrpc: "2.0", id: 1, result: { value: 1_000_000_000 } });
  if (body?.method === "simulateTransaction") {
    simulated.push(body.params[0]);
    return Response.json({ jsonrpc: "2.0", id: 1, result: { value: { err: simulation.err ?? null, logs: simulation.logs ?? [], unitsConsumed: simulation.unitsConsumed ?? 100_000, accounts: [{ lamports: 1_000_000_000 - (simulation.spent ?? 10_000) }] } } });
  }
  return null;
}
/** Mocks Jupiter quote + build and the paymaster RPC. `build` decides each build response given its 1-based call number. */
function jupiter(build: (call: number, url: URL) => Response = (_call, url) => buildFor(url), buildRequests: URL[] = [], simulation: Simulation = {}) {
  let quoteCalls = 0; let buildCalls = 0;
  globalThis.fetch = mock(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "mainnet.helius-rpc.com") return sponsorRpc(JSON.parse(String(options?.body)), simulation) ?? new Response("unexpected", { status: 500 });
    expect((options?.headers as Record<string, string>)["x-api-key"]).toBe("test");
    if (url.pathname.endsWith("/quote")) { quoteCalls++; return quoteFor(url); }
    buildRequests.push(url);
    return build(++buildCalls, url);
  }) as unknown as typeof fetch;
  return { quoteCalls: () => quoteCalls, buildCalls: () => buildCalls };
}
function sponsored() { process.env.HELIUS_API_KEY = "test"; process.env.SOLANA_PAYMASTER_KEY = bs58.encode(PAYMASTER.secretKey); }
function decoded(base64: string) {
  const tx = VersionedTransaction.deserialize(Buffer.from(base64, "base64"));
  const keys = tx.message.staticAccountKeys.map((key) => key.toBase58());
  return { tx, signers: keys.slice(0, tx.message.header.numRequiredSignatures), paymasterSigned: tx.signatures[0]!.some(Boolean), walletSigned: tx.signatures[1]?.some(Boolean) ?? false };
}

beforeEach(() => {
  process.env.STOCKPILE_XSTOCKS = "0";
  saved.clear(); lots.length = 0; insertedUser = undefined; deleted = false;
  process.env.PRIVY_APP_ID = "test-app"; process.env.PRIVY_APP_SECRET = "test-secret";
  delete process.env.JUPITER_API_KEY; delete process.env.HELIUS_API_KEY; resetMintRegistry(); delete process.env.SOLANA_PAYMASTER_KEY; process.env.STOCKPILE_PRESTOCKS = "0";
  globalThis.fetch = originalFetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

describe("authenticated account flows (mocked identity, DB, HTTP)", () => {
  it("rejects invalid and expired identity tokens without touching persistence", async () => {
    for (const token of ["invalid", "expired"]) expect((await app.request("/me", { headers: auth(token) })).status).toBe(401);
    expect(insertedUser).toBeUndefined();
  });
  it("returns profile from verified identity and keeps saved bags scoped by identity", async () => {
    const me = await app.request("/me", { headers: auth() });
    expect(me.status).toBe(200);
    expect((await me.json() as any).user.walletAddress).toBe(WALLET);
    expect(insertedUser).toBe("user-a");
    expect((await post("/saved-bags", { bagId: "unknown" })).status).toBe(404);
    expect((await post("/saved-bags", { basketId: "megacap-builders" })).status).toBe(400);
    expect((await post("/saved-bags", { bagId: "megacap-builders" })).status).toBe(200);
    expect((await post("/saved-bags", { bagId: "megacap-builders" })).status).toBe(200);
    expect((await json(app.request("/saved-bags", { headers: auth() }))).bagIds).toEqual(["megacap-builders"]);
    expect((await json(app.request("/saved-bags", { headers: auth("other") }))).bagIds).toEqual([]);
    const removed = await app.request("/saved-bags/megacap-builders", { method: "DELETE", headers: auth() });
    expect(removed.status).toBe(200);
    expect(deleted).toBe(true);
    expect((await removed.json() as any).bagIds).toEqual([]);
  });
});

describe("portfolio (mocked Helius)", () => {
  it("does not claim balances when wallet or Helius is absent, or provider fails", async () => {
    expect(await json(app.request("/portfolio", { headers: auth("no-wallet") }))).toMatchObject({ walletAddress: null, status: "unavailable", holdings: [], sol: null, usdc: null });
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "unavailable", holdings: [], sol: null, usdc: null, message: "Helius is not configured" });
    process.env.HELIUS_API_KEY = "test";
    globalThis.fetch = mock(async () => new Response("error", { status: 503 })) as unknown as typeof fetch;
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "unavailable", holdings: [], sol: null, usdc: null });
    globalThis.fetch = mock(async () => Response.json([{ id: 1, result: { value: 5 } }, { id: 2, error: { code: -32000 } }, { id: 3, result: { value: [] } }])) as unknown as typeof fetch;
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "unavailable", sol: null });
  });
  it("reads SOL, USDC and Token-2022 holdings from one batched Helius RPC call", async () => {
    process.env.HELIUS_API_KEY = "test";
    seedMints(`NVDAx:${mints.NVDAx}`);
    const tokenAccount = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals, uiAmountString: (Number(amount) / 10 ** decimals).toString() } } } } } });
    const calls = mock(async (url: string | URL | Request, options?: RequestInit) => {
      expect(String(url)).not.toContain("undefined");
      const batch = JSON.parse(String(options?.body)) as { id: number; method: string; params: unknown[] }[];
      expect(batch.map((item) => item.method)).toEqual(["getBalance", "getTokenAccountsByOwner", "getTokenAccountsByOwner"]);
      expect(batch.every((item) => item.params[0] === WALLET)).toBe(true);
      expect((batch[2]!.params[1] as { programId: string }).programId).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
      return Response.json([{ id: 1, result: { value: 1500000 } }, { id: 2, result: { value: [tokenAccount(USDC, "120", 6), tokenAccount(USDC, "0", 6)] } }, { id: 3, result: { value: [tokenAccount(mints.NVDAx, "700", 8)] } }]);
    });
    globalThis.fetch = calls as unknown as typeof fetch;
    const portfolio = await json(app.request("/portfolio", { headers: auth() }));
    expect(portfolio).toMatchObject({ status: "live", walletAddress: WALLET, sol: { amount: "1500000", decimals: 9 }, usdc: { amount: "120", decimals: 6 },
      holdings: [{ mint: USDC, symbol: "USDC", amount: "120", decimals: 6, uiAmount: "0.00012", program: "token" }, { mint: mints.NVDAx, symbol: "NVDAx", amount: "700", decimals: 8, uiAmount: "0.000007", program: "token-2022" }] });
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it("reports zero USDC honestly when the wallet holds none", async () => {
    process.env.HELIUS_API_KEY = "test";
    globalThis.fetch = mock(async () => Response.json([{ id: 1, result: { value: 0 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: [] } }])) as unknown as typeof fetch;
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "live", sol: { amount: "0", decimals: 9, uiAmount: "0", usdPrice: null, usdValue: 0 }, usdc: { amount: "0", decimals: 6, usdValue: 0 }, holdings: [], totalUsd: 0, unpricedCount: 0 });
  });
  it("enriches holdings with Jupiter metadata, prices, bag membership and honest totals (Helius stays the balance source)", async () => {
    resetTokenMetaCache();
    process.env.HELIUS_API_KEY = "test"; process.env.JUPITER_API_KEY = "jup";
    seedMints(`NVDAx:${mints.NVDAx}`);
    const unknown = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
    const tokenAccount = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals, uiAmountString: (Number(amount) / 10 ** decimals).toString() } } } } } });
    const calls: string[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, options?: RequestInit) => {
      const url = new URL(String(input)); calls.push(url.hostname + url.pathname);
      if (url.hostname === "api.jup.ag") {
        expect((options?.headers as Record<string, string>)["x-api-key"]).toBe("jup");
        expect(url.searchParams.get("query")!.split(",").sort()).toEqual(["So11111111111111111111111111111111111111112", USDC, mints.NVDAx, unknown].sort());
        return Response.json([{ id: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Wrapped SOL", decimals: 9, usdPrice: 200, icon: "https://img.example/sol.png" }, { id: USDC, symbol: "USDC", name: "USD Coin", decimals: 6, usdPrice: 0.9999 }, { id: mints.NVDAx, symbol: "NVDAx", name: "NVIDIA xStock", decimals: 8, usdPrice: 180.5, icon: "https://img.example/nvda.png" }]);
      }
      return Response.json([{ id: 1, result: { value: 1500000000 } }, { id: 2, result: { value: [tokenAccount(USDC, "5000000", 6), tokenAccount(unknown, "42", 0)] } }, { id: 3, result: { value: [tokenAccount(mints.NVDAx, "2100000", 8)] } }]);
    }) as unknown as typeof fetch;
    const portfolio = await json(app.request("/portfolio", { headers: auth() }));
    expect(portfolio).toMatchObject({ status: "live", totalUsd: 308.7900, unpricedCount: 1,
      sol: { amount: "1500000000", uiAmount: "1.5", usdPrice: 200, usdValue: 300 }, usdc: { amount: "5000000", uiAmount: "5", usdPrice: 0.9999, usdValue: 4.9995 } });
    expect(portfolio.holdings).toEqual([
      { mint: USDC, symbol: "USDC", name: "USD Coin", iconUrl: null, amount: "5000000", decimals: 6, uiAmount: "5", program: "token", usdPrice: 0.9999, usdValue: 4.9995, bagIds: [] },
      { mint: unknown, symbol: null, name: null, iconUrl: null, amount: "42", decimals: 0, uiAmount: "42", program: "token", usdPrice: null, usdValue: null, bagIds: [] },
      { mint: mints.NVDAx, symbol: "NVDAx", name: "NVIDIA xStock", iconUrl: "https://img.example/nvda.png", amount: "2100000", decimals: 8, uiAmount: "0.021", program: "token-2022", usdPrice: 180.5, usdValue: 3.7905, bagIds: ["megacap-builders", "ai-infrastructure"] },
    ]);
    expect(calls).toEqual(["mainnet.helius-rpc.com/", "api.jup.ag/tokens/v2/search"]);
    // Jupiter outage: balances are still served, prices are simply absent.
    resetTokenMetaCache();
    globalThis.fetch = mock(async (input: string | URL | Request) => new URL(String(input)).hostname === "api.jup.ag" ? new Response("down", { status: 503 })
      : Response.json([{ id: 1, result: { value: 1500000000 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: [tokenAccount(mints.NVDAx, "2100000", 8)] } }])) as unknown as typeof fetch;
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "live", totalUsd: 0, unpricedCount: 2, sol: { usdPrice: null, usdValue: null }, holdings: [{ symbol: "NVDAx", name: "NVIDIA xStock", usdPrice: null, usdValue: null, bagIds: ["megacap-builders", "ai-infrastructure"] }] });
  });
});

describe("activity (mocked Helius RPC)", () => {
  const signature = `7${"5".repeat(87)}`;
  it("returns typed errors without a wallet or provider and validates the cursor", async () => {
    resetActivityCache();
    expect(await json(app.request("/activity", { headers: auth("no-wallet") }))).toMatchObject({ status: "unavailable", walletAddress: null, items: [], nextCursor: null, error: { code: "NO_WALLET" } });
    expect(await json(app.request("/activity", { headers: auth() }))).toMatchObject({ status: "unavailable", walletAddress: WALLET, items: [], error: { code: "PROVIDER_NOT_CONFIGURED", message: "Helius is not configured" } });
    expect((await app.request("/activity?cursor=not-a-token", { headers: auth() })).status).toBe(400);
    expect((await app.request(`/activity?cursor=${signature}`, { headers: auth() })).status).toBe(400);
    expect((await app.request("/activity?limit=0", { headers: auth() })).status).toBe(400);
  });
  it("serves normalised getTransactionsForAddress pages with limit/cursor passthrough, a 400 for a rejected token, and a typed provider error", async () => {
    resetActivityCache();
    process.env.HELIUS_API_KEY = "test";
    const transfer = { slot: 1, blockTime: 1790388000, transaction: { signatures: [signature], message: { accountKeys: [{ pubkey: WALLET, signer: true, writable: true }, { pubkey: OTHER_WALLET, signer: false, writable: true }], instructions: [{ program: "system", programId: "11111111111111111111111111111111" }] } },
      meta: { err: null, fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [749_995_000, 250_000_000], preTokenBalances: [], postTokenBalances: [] } };
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("mainnet.helius-rpc.com");
      const body = JSON.parse(String(init?.body)) as { method: string; params: [string, Record<string, unknown>] };
      expect(body.method).toBe("getTransactionsForAddress");
      expect(body.params[0]).toBe(WALLET);
      expect(body.params[1]).toMatchObject({ limit: 1, paginationToken: "450291856:69", transactionDetails: "full", encoding: "jsonParsed" });
      return Response.json({ jsonrpc: "2.0", id: 1, result: { data: [transfer], paginationToken: "450282300:176" } });
    }) as unknown as typeof fetch;
    const page = await json(app.request("/activity?limit=1&cursor=450291856:69", { headers: auth() }));
    expect(page).toMatchObject({ status: "live", walletAddress: WALLET, nextCursor: "450282300:176", error: null, items: [{ signature, kind: "transfer-out", status: "confirmed", summary: "Sent 0.25 SOL to EPjF…Dt1v", feeLamports: 5000, bagId: null, explorerUrl: `https://solscan.io/tx/${signature}`, legs: [{ symbol: "SOL", amount: "0.25", direction: "out" }] }] });
    resetActivityCache();
    globalThis.fetch = mock(async () => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Bad request: Invalid pagination token" } })) as unknown as typeof fetch;
    const rejected = await app.request("/activity?cursor=1:1", { headers: auth() });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: "Invalid activity cursor" });
    globalThis.fetch = mock(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    expect(await json(app.request("/activity", { headers: auth() }))).toMatchObject({ status: "unavailable", items: [], error: { code: "PROVIDER_UNAVAILABLE" } });
  });
});
describe("trade quote and prepare (mocked Jupiter)", () => {
  it("rejects malformed trade requests and never calls a provider", async () => {
    const calls = mock(async () => { throw new Error("must not fetch"); });
    globalThis.fetch = calls as unknown as typeof fetch;
    for (const amount of ["0", "1.5", "100000000000000000000"]) expect((await post("/trade/quote", { ...requestBody, amount })).status).toBe(400);
    expect((await post("/trade/quote", { ...requestBody, slippageBps: 501 })).status).toBe(400);
    expect((await post("/trade/quote", { basketId: "megacap-builders", inputMint: USDC, amount: "1" })).status).toBe(400);
    expect((await post("/trade/quote", { ...requestBody, bagId: "unknown" })).status).toBe(404);
    expect(calls).not.toHaveBeenCalled();
  });
  it("fails closed with typed errors: no wallet, unsupported input, no Jupiter key, incomplete allowlist, tiny amount", async () => {
    allMints();
    expect(await json(post("/trade/prepare", requestBody, "no-wallet"))).toMatchObject({ status: "unavailable", transactions: [], error: { code: "NO_WALLET", legIndex: null, symbol: null } });
    expect(await json(post("/trade/quote", { ...requestBody, inputMint: WALLET }))).toMatchObject({ status: "unavailable", legs: [], error: { code: "UNSUPPORTED_INPUT_MINT" } });
    expect(await json(post("/trade/quote", requestBody))).toMatchObject({ status: "unavailable", legs: [], error: { code: "PROVIDER_NOT_CONFIGURED" } });
    process.env.JUPITER_API_KEY = "test";
    seedMints(`AAPLx:${mints.AAPLx},MSFTx:${mints.MSFTx}`);
    const calls = mock(async () => { throw new Error("must not fetch"); });
    globalThis.fetch = calls as unknown as typeof fetch;
    expect(await json(post("/trade/quote", requestBody))).toMatchObject({ status: "unavailable", error: { code: "BAG_NOT_TRADABLE", symbol: "NVDAx" } });
    allMints();
    expect(await json(post("/trade/quote", { ...requestBody, amount: "2" }))).toMatchObject({ status: "unavailable", error: { code: "AMOUNT_TOO_SMALL", legIndex: 0, symbol: "AAPLx" } });
    expect(calls).not.toHaveBeenCalled();
  });
  it("returns labelled legs whose USDC allocations follow weights and sum to the amount", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    const { quoteCalls } = jupiter(() => new Response("unused", { status: 500 }));
    const quote = await json(post("/trade/quote", { ...requestBody, amount: "1000001", slippageBps: 75 }));
    expect(quote).toMatchObject({ status: "available", bagId: "megacap-builders", amount: "1000001", slippageBps: 75, error: null });
    expect(quote.legs).toEqual([
      { index: 0, symbol: "AAPLx", weightBps: 3500, inputMint: USDC, outputMint: mints.AAPLx, outputDecimals: 8, uiAmountMultiplier: 1, inputAmount: "350000", outAmount: "42", minOutAmount: "41", priceImpactPct: "0.001", routeSteps: 1 },
      { index: 1, symbol: "MSFTx", weightBps: 3500, inputMint: USDC, outputMint: mints.MSFTx, outputDecimals: 8, uiAmountMultiplier: 1, inputAmount: "350000", outAmount: "42", minOutAmount: "41", priceImpactPct: "0.001", routeSteps: 1 },
      { index: 2, symbol: "NVDAx", weightBps: 3000, inputMint: USDC, outputMint: mints.NVDAx, outputDecimals: 8, uiAmountMultiplier: 1, inputAmount: "300001", outAmount: "42", minOutAmount: "41", priceImpactPct: "0.001", routeSteps: 1 },
    ]);
    expect(quoteCalls()).toBe(3);
  });
  it("maps Jupiter quote errors to typed codes with the failing leg", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    const cases: [Response, string][] = [
      [Response.json({ error: "No routes found", errorCode: "NO_ROUTES_FOUND" }, { status: 400 }), "NO_ROUTE"],
      [Response.json({ error: "The token is not tradable", errorCode: "TOKEN_NOT_TRADABLE" }, { status: 400 }), "TOKEN_NOT_TRADABLE"],
      [new Response("upstream", { status: 502 }), "PROVIDER_ERROR"],
    ];
    for (const [response, code] of cases) {
      globalThis.fetch = mock(async (input: string | URL | Request) => { const url = new URL(String(input)); return url.searchParams.get("outputMint") === mints.MSFTx ? response : quoteFor(url); }) as unknown as typeof fetch;
      expect(await json(post("/trade/quote", requestBody))).toMatchObject({ status: "unavailable", legs: [], error: { code, legIndex: 1, symbol: "MSFTx" } });
    }
    globalThis.fetch = mock(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    expect(await json(post("/trade/quote", requestBody))).toMatchObject({ status: "unavailable", error: { code: "PROVIDER_TIMEOUT", legIndex: 0 } });
  });
  it("does not accept mismatched Jupiter response mints", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    globalThis.fetch = mock(async (input: string | URL | Request) => Response.json({ inputMint: USDC, outputMint: WALLET, inAmount: new URL(String(input)).searchParams.get("amount"), outAmount: "42" })) as unknown as typeof fetch;
    expect(await json(post("/trade/quote", requestBody))).toMatchObject({ status: "unavailable", legs: [], error: { code: "QUOTE_MISMATCH", legIndex: 0 } });
  });
  it("returns no partial preparation after a leg error", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    const { quoteCalls, buildCalls } = jupiter((call, url) => call === 2 ? new Response("fail", { status: 503 }) : buildFor(url));
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", transactions: [], error: { code: "PROVIDER_ERROR", legIndex: 1, symbol: "MSFTx" } });
    expect(quoteCalls()).toBe(0);
    expect(buildCalls()).toBe(2);
  });
  it("fails closed when sponsored fees are not configured", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    const { buildCalls } = jupiter();
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "PROVIDER_NOT_CONFIGURED" } });
    process.env.HELIUS_API_KEY = "test"; process.env.SOLANA_PAYMASTER_KEY = "not a key";
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "PROVIDER_NOT_CONFIGURED" } });
    expect(buildCalls()).toBe(0);
  });
  it("prepares one sponsored transaction per leg: paymaster pays and pre-signs, the wallet only signs the swap, RTSE by default", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    const requests: URL[] = [];
    jupiter(undefined, requests);
    const result = await json(post("/trade/prepare", requestBody));
    expect(result).toMatchObject({ status: "ready", walletAddress: WALLET, bagId: "megacap-builders", slippageBps: null, error: null });
    expect(result.transactions.map((t: any) => [t.index, t.symbol, t.outputMint, t.inputAmount, t.minOutAmount, t.slippageBps, t.feePayer, t.lastValidBlockHeight])).toEqual([
      [0, "AAPLx", mints.AAPLx, "350000", "41", 37, PAYER, 123], [1, "MSFTx", mints.MSFTx, "350000", "41", 37, PAYER, 123], [2, "NVDAx", mints.NVDAx, "300000", "41", 37, PAYER, 123]]);
    for (const t of result.transactions) {
      const { tx, signers, paymasterSigned, walletSigned } = decoded(t.transaction);
      expect(signers).toEqual([PAYER, WALLET]);
      expect(paymasterSigned).toBe(true);
      expect(walletSigned).toBe(false);
      expect(tx.message.compiledInstructions).toHaveLength(4); // CU limit, clamped CU price, swap, Sender tip
      // Last instruction: System transfer of the 5,000-lamport Helius Sender tip, paid by the paymaster.
      const keys = tx.message.staticAccountKeys.map((key) => key.toBase58());
      const tip = tx.message.compiledInstructions.at(-1)!;
      expect(keys[tip.programIdIndex]).toBe("11111111111111111111111111111111");
      expect(keys[tip.accountKeyIndexes[0]!]).toBe(PAYER);
      expect(SENDER_TIP_ACCOUNTS as readonly string[]).toContain(keys[tip.accountKeyIndexes[1]!]!);
      expect(Buffer.from(tip.data).readBigUInt64LE(4)).toBe(BigInt(SENDER_TIP_LAMPORTS));
    }
    expect(requests.map((url) => url.pathname)).toEqual(["/swap/v2/build", "/swap/v2/build", "/swap/v2/build"]);
    expect(requests.map((url) => url.searchParams.get("outputMint"))).toEqual(Object.values(mints));
    expect(requests.every((url) => url.searchParams.get("taker") === WALLET && url.searchParams.get("payer") === PAYER && url.searchParams.get("slippageBps") === "rtse")).toBe(true);
    // The advanced override is passed through as a fixed limit.
    jupiter(undefined, requests.splice(0));
    expect(await json(post("/trade/prepare", { ...requestBody, slippageBps: 100 }))).toMatchObject({ status: "ready", slippageBps: 100 });
    expect(requests.every((url) => url.searchParams.get("slippageBps") === "100")).toBe(true);
  });
  it("sets the CU limit from simulation and clamps Jupiter's CU price", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    jupiter(undefined, [], { unitsConsumed: 200_000 });
    const result = await json(post("/trade/prepare", requestBody));
    const { tx } = decoded(result.transactions[0].transaction);
    const [limit, price] = tx.message.compiledInstructions.map((ix) => Buffer.from(ix.data));
    expect(limit![0]).toBe(2); expect(limit!.readUInt32LE(1)).toBe(240_000);
    expect(price![0]).toBe(3); expect(price!.readBigUInt64LE(1)).toBe(1_000_000n);
  });
  it("refuses builds that misuse the paymaster, overspend it, or would fail on chain", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    const token = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const drains: Record<string, unknown>[] = [
      { swapInstruction: undefined },
      { setupInstructions: [ix("11111111111111111111111111111111", [[PAYER, true, true], [OTHER_WALLET, false, true]], [2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])] },
      { setupInstructions: [ix(token, [[PAYER, true, true]])] },
      { setupInstructions: [ix(JUP, [[OTHER_WALLET, true, true]])] },
    ];
    for (const extra of drains) {
      jupiter((_call, url) => buildFor(url, extra));
      expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", transactions: [], error: { code: "INVALID_TRANSACTION", legIndex: 0, symbol: "AAPLx" } });
    }
    jupiter(undefined, [], { spent: 50_000_000 });
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "INVALID_TRANSACTION", legIndex: 0 } });
    jupiter(undefined, [], { err: { InstructionError: [2, { Custom: 6001 }] }, logs: ["Program log: Error: SlippageToleranceExceeded"] });
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "SLIPPAGE_REJECTED", legIndex: 0, symbol: "AAPLx" } });
    jupiter(undefined, [], { err: { InstructionError: [2, { Custom: 1 }] } });
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "PROVIDER_ERROR", legIndex: 0 } });
    jupiter((_call, url) => buildFor(url, { outputMint: OTHER_WALLET }));
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", error: { code: "QUOTE_MISMATCH", legIndex: 0 } });
  });
});

describe("bag positions and sell trades (mocked Helius + Jupiter)", () => {
  const signature = "5".repeat(88);
  const tokenBalance = (accountIndex: number, owner: string, mint: string, amount: string, decimals: number) => ({ accountIndex, owner, mint, uiTokenAmount: { amount, decimals, uiAmountString: (Number(amount) / 10 ** decimals).toString() } });
  const tokenAccount = (mint: string, amount: string, decimals: number) => ({ account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals, uiAmountString: (Number(amount) / 10 ** decimals).toString() } } } } } });
  /** Helius: getTransaction -> buyTx (or null), balance batch -> 660000 NVDAx; Jupiter: token metadata + quotes. */
  function providers(options: { found?: boolean; balance?: string } = {}) {
    const quotes: URL[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "mainnet.helius-rpc.com") {
        const body = JSON.parse(String(init?.body));
        if (Array.isArray(body)) return Response.json([{ id: 1, result: { value: 1_000_000 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: options.balance === "0" ? [] : [tokenAccount(mints.NVDAx, options.balance ?? "660000", 8)] } }]);
        expect(body.method).toBe("getTransaction"); expect(body.params[0]).toBe(signature);
        return Response.json({ jsonrpc: "2.0", id: 1, result: options.found === false ? null : buyTx(signature) });
      }
      if (url.pathname.startsWith("/tokens/v2/search")) return Response.json([{ id: mints.NVDAx, symbol: "NVDAx", decimals: 8, icon: "https://img.example/nvda.png", usdPrice: 250 }]);
      if (url.pathname.endsWith("/quote")) { quotes.push(url); return quoteFor(url, { outAmount: "1600000", otherAmountThreshold: "1590000" }); }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    return quotes;
  }
  it("records a leg from chain data (202 until visible, 200 idempotent, 409 when linked elsewhere), then reports and sells the position", async () => {
    allMints(); resetTokenMetaCache(); process.env.HELIUS_API_KEY = "test"; process.env.JUPITER_API_KEY = "test";
    expect((await post("/positions/legs", { bagId: "megacap-builders", signature: "nope" })).status).toBe(400);
    expect((await post("/positions/legs", { bagId: "unknown", signature })).status).toBe(404);
    providers({ found: false });
    const pending = await post("/positions/legs", { bagId: "megacap-builders", signature });
    expect(pending.status).toBe(202); expect(await pending.json()).toMatchObject({ status: "pending" });
    providers();
    const recorded = await post("/positions/legs", { bagId: "megacap-builders", signature });
    expect(recorded.status).toBe(200);
    expect(await recorded.json()).toEqual({ lot: { id: expect.stringMatching(/^lot_/), bagId: "megacap-builders", mint: mints.NVDAx, symbol: "NVDAx", side: "buy", tokenAmount: "660000", tokenUiAmount: 0.0066, decimals: 8, usdcAmount: "1500000", usdcUiAmount: 1.5, signature, ts: new Date(1790388000 * 1000).toISOString() } });
    expect(insertedUser).toBe("user-a");
    expect((await post("/positions/legs", { bagId: "megacap-builders", signature })).status).toBe(200);
    const conflict = await post("/positions/legs", { bagId: "ai-infrastructure", signature });
    expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: "Signature is already linked to megacap-builders", code: "SIGNATURE_ALREADY_LINKED", bagId: "megacap-builders" });
    expect(await json(post("/positions/legs", { bagId: "megacap-builders", signature }, "other"))).toEqual({ error: "The transaction was not paid by your wallet", code: "NOT_YOUR_TRANSACTION" });

    const positions = await json(app.request("/positions", { headers: auth() }));
    expect(positions).toEqual({ walletAddress: WALLET, status: "live", bags: [{ bagId: "megacap-builders", title: "Megacap Builders", costUsdc: 1.5, valueUsd: 1.65, pnlUsd: 0.15, pnlPct: 10, reconciled: true, sellable: true, lotCount: 1, lastTradedAt: new Date(1790388000 * 1000).toISOString(),
      legs: [{ mint: mints.NVDAx, symbol: "NVDAx", iconUrl: "https://img.example/nvda.png", decimals: 8, tracked: "660000", trackedUi: 0.0066, walletBalance: "660000", held: "660000", heldUi: 0.0066, usdPrice: 250, usdValue: 1.65, costUsdc: 1.5 }] }] });
    expect(await json(app.request("/positions", { headers: auth("other") }))).toEqual({ walletAddress: WALLET, status: "live", bags: [] });

    const quotes = providers({ balance: "330000" }); // wallet holds half of what was tracked -> sells from held
    const quote = await json(post("/trade/quote", { bagId: "megacap-builders", side: "sell", portionBps: 10000 }));
    // Automatic protection: indicative quote at 50 bps, but no minimum is promised until the swap is built.
    expect(quote).toMatchObject({ status: "available", side: "sell", bagId: "megacap-builders", inputMint: null, amount: null, portionBps: 10000, slippageBps: null, totalOutAmount: "1600000", error: null });
    expect(quote.legs).toEqual([{ index: 0, symbol: "NVDAx", weightBps: 3000, inputMint: mints.NVDAx, outputMint: USDC, outputDecimals: 6, uiAmountMultiplier: 1, inputAmount: "330000", outAmount: "1600000", minOutAmount: null, priceImpactPct: "0.001", routeSteps: 1 }]);
    expect(quotes.map((url) => [url.searchParams.get("inputMint"), url.searchParams.get("outputMint"), url.searchParams.get("amount"), url.searchParams.get("slippageBps")])).toEqual([[mints.NVDAx, USDC, "330000", "50"]]);
    expect(await json(post("/trade/quote", { bagId: "megacap-builders", side: "sell", portionBps: 10000, slippageBps: 300 }))).toMatchObject({ slippageBps: 300, legs: [{ minOutAmount: "1590000" }] });
    expect(await json(post("/trade/quote", { bagId: "megacap-builders", side: "sell", portionBps: 2500 }))).toMatchObject({ legs: [{ inputAmount: "82500" }], totalOutAmount: "1600000" });
    providers({ balance: "0" });
    expect(await json(post("/trade/quote", { bagId: "megacap-builders", side: "sell", portionBps: 10000 }))).toMatchObject({ status: "unavailable", legs: [], totalOutAmount: null, error: { code: "NO_POSITION" } });
    expect(await json(post("/trade/quote", { bagId: "ai-infrastructure", side: "sell", portionBps: 10000 }))).toMatchObject({ status: "unavailable", error: { code: "NO_POSITION" } });
    // Buys are unchanged: side defaults to buy and echoes the USDC input; sells without portionBps and buys without amount are 400.
    expect((await post("/trade/quote", { bagId: "megacap-builders", side: "sell" })).status).toBe(400);
    expect((await post("/trade/quote", { bagId: "megacap-builders", inputMint: USDC })).status).toBe(400);
    expect((await post("/trade/quote", { bagId: "megacap-builders", side: "sell", portionBps: 0 })).status).toBe(400);
  });
  it("links a submitted leg to its bag server-side once it confirms, without the app recording it", async () => {
    allMints(); resetTokenMetaCache(); sponsored();
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: PAYMASTER.publicKey, recentBlockhash: bs58.encode(new Uint8Array(32).fill(7)), instructions: [
      new TransactionInstruction({ programId: new PublicKey(JUP), keys: [{ pubkey: new PublicKey(WALLET), isSigner: true, isWritable: false }], data: Buffer.from([1]) }),
    ] }).compileToV0Message());
    tx.sign([PAYMASTER]); tx.signatures[1] = new Uint8Array(64).fill(1);
    let visible = false;
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "sender.helius-rpc.com") return Response.json({ jsonrpc: "2.0", id: 1, result: signature });
      if (url.hostname === "mainnet.helius-rpc.com") {
        const body = JSON.parse(String(init?.body));
        if (body.method === "sendTransaction") return Response.json({ jsonrpc: "2.0", id: 1, result: signature });
        expect(body.method).toBe("getTransaction");
        return Response.json({ jsonrpc: "2.0", id: 1, result: visible ? buyTx(signature) : null });
      }
      if (url.pathname.startsWith("/tokens/v2/search")) return Response.json([]);
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    expect(await json(post("/trade/submit", { transaction: Buffer.from(tx.serialize()).toString("base64"), bagId: "megacap-builders" }))).toEqual({ signature });
    expect(lots).toEqual([]);
    visible = true;
    const deadline = Date.now() + 8_000;
    while (!lots.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lots).toEqual([expect.objectContaining({ userId: "user-a", bagId: "megacap-builders", mint: mints.NVDAx, side: "buy", signature })]);
  }, 12_000);
  it("prepares sponsored sell legs, echoing side and totalOutAmount", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    lots.push({ id: "lot_1", userId: "user-a", bagId: "megacap-builders", walletAddress: WALLET, mint: mints.NVDAx, symbol: "NVDAx", side: "buy", tokenAmount: "660000", decimals: 8, usdcAmount: "1500000", signature, slot: null, blockTime: null, createdAt: new Date() });
    const builds: URL[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "mainnet.helius-rpc.com") return sponsorRpc(JSON.parse(String(init?.body))) ?? Response.json([{ id: 1, result: { value: 1 } }, { id: 2, result: { value: [] } }, { id: 3, result: { value: [tokenAccount(mints.NVDAx, "660000", 8)] } }]);
      if (url.pathname.startsWith("/tokens/v2/search")) return Response.json([]);
      if (url.pathname.endsWith("/build")) { builds.push(url); return buildFor(url, { outAmount: "800000" }); }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const result = await json(post("/trade/prepare", { bagId: "megacap-builders", side: "sell", portionBps: 5000 }));
    expect(result).toMatchObject({ status: "ready", side: "sell", portionBps: 5000, inputMint: null, amount: null, walletAddress: WALLET, totalOutAmount: "800000", error: null });
    expect(result.transactions).toEqual([expect.objectContaining({ index: 0, symbol: "NVDAx", inputMint: mints.NVDAx, outputMint: USDC, inputAmount: "330000", outAmount: "800000", feePayer: PAYER, lastValidBlockHeight: 123 })]);
    expect(decoded(result.transactions[0].transaction).signers).toEqual([PAYER, WALLET]);
    expect(builds.map((url) => [url.searchParams.get("inputMint"), url.searchParams.get("outputMint"), url.searchParams.get("amount"), url.searchParams.get("taker"), url.searchParams.get("payer")])).toEqual([[mints.NVDAx, USDC, "330000", WALLET, PAYER]]);
    // The activity feed prefers the recorded lot over the catalogue guess.
    resetActivityCache();
    const transfer = buyTx(signature);
    globalThis.fetch = mock(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { data: [transfer], paginationToken: null } })) as unknown as typeof fetch;
    lots[0]!.bagId = "ai-infrastructure";
    expect(await json(app.request("/activity?limit=1", { headers: auth() }))).toMatchObject({ items: [{ signature, kind: "swap", bagId: "ai-infrastructure", bagLinked: true }] });
    lots.length = 0; resetActivityCache();
    expect(await json(app.request("/activity?limit=1", { headers: auth() }))).toMatchObject({ items: [{ signature, bagId: "megacap-builders", bagLinked: false }] });
  });
  it("sells only token balances held outside every bag position", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test"; sponsored();
    const loose = "55555555555555555555555555555555";
    // 660000 NVDAx tracked by Megacap Builders; the wallet holds 1000000 -> 340000 is loose. `loose` isn't in any bag.
    lots.push({ id: "lot_1", userId: "user-a", bagId: "megacap-builders", walletAddress: WALLET, mint: mints.NVDAx, symbol: "NVDAx", side: "buy", tokenAmount: "660000", decimals: 8, usdcAmount: "1500000", signature, slot: null, blockTime: null, createdAt: new Date() });
    const quotes: URL[] = []; const builds: URL[] = [];
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "mainnet.helius-rpc.com") return sponsorRpc(JSON.parse(String(init?.body))) ?? Response.json([{ id: 1, result: { value: 1 } }, { id: 2, result: { value: [tokenAccount(loose, "9000", 6)] } }, { id: 3, result: { value: [tokenAccount(mints.NVDAx, "1000000", 8)] } }]);
      if (url.pathname.startsWith("/tokens/v2/search")) return Response.json([{ id: loose, symbol: "LOOSE", decimals: 6 }]);
      if (url.pathname.endsWith("/quote")) { quotes.push(url); return quoteFor(url, { outAmount: "500000" }); }
      if (url.pathname.endsWith("/build")) { builds.push(url); return buildFor(url, { outAmount: "500000" }); }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const quote = await json(post("/trade/tokens/quote", { mints: [mints.NVDAx, loose], portionBps: 10000 }));
    expect(quote).toMatchObject({ status: "available", mints: [mints.NVDAx, loose], portionBps: 10000, slippageBps: null, totalOutAmount: "1000000", error: null });
    expect(quotes.map((url) => [url.searchParams.get("inputMint"), url.searchParams.get("outputMint"), url.searchParams.get("amount")])).toEqual([[mints.NVDAx, USDC, "340000"], [loose, USDC, "9000"]]);
    expect(quote.legs.map((leg: { symbol: string }) => leg.symbol)).toEqual(["NVDAx", "LOOSE"]);
    const prepared = await json(post("/trade/tokens/prepare", { mints: [mints.NVDAx], portionBps: 5000 }));
    expect(prepared).toMatchObject({ status: "ready", walletAddress: WALLET, totalOutAmount: "500000", transactions: [{ inputMint: mints.NVDAx, outputMint: USDC, inputAmount: "170000", feePayer: PAYER }] });
    expect(builds.map((url) => url.searchParams.get("amount"))).toEqual(["170000"]);
    // Nothing loose (fully claimed by a bag), USDC itself, and malformed requests are refused.
    lots[0]!.tokenAmount = "1000000";
    expect(await json(post("/trade/tokens/quote", { mints: [mints.NVDAx], portionBps: 10000 }))).toMatchObject({ status: "unavailable", legs: [], error: { code: "NO_POSITION", symbol: "NVDAx" } });
    expect(await json(post("/trade/tokens/quote", { mints: [USDC], portionBps: 10000 }))).toMatchObject({ status: "unavailable", error: { code: "UNSUPPORTED_INPUT_MINT" } });
    expect((await post("/trade/tokens/quote", { mints: [], portionBps: 10000 })).status).toBe(400);
    expect((await post("/trade/tokens/quote", { mints: [loose], portionBps: 0 })).status).toBe(400);
  });
  function buyTx(sig: string) {
    return { slot: 1, blockTime: 1790388000, transaction: { signatures: [sig], message: { accountKeys: [{ pubkey: WALLET }, { pubkey: OTHER_WALLET }, { pubkey: "11111111111111111111111111111111" }, { pubkey: "22222222222222222222222222222222" }], instructions: [] } },
      meta: { err: null, fee: 5000, preBalances: [1_000_000_000, 0, 0, 0], postBalances: [999_995_000, 0, 0, 0], preTokenBalances: [tokenBalance(2, WALLET, USDC, "5000000", 6), tokenBalance(3, WALLET, mints.NVDAx, "0", 8)], postTokenBalances: [tokenBalance(2, WALLET, USDC, "3500000", 6), tokenBalance(3, WALLET, mints.NVDAx, "660000", 8)] } };
  }
});

describe("trade relay (mocked Helius)", () => {
  /** A paymaster-paid swap the wallet must co-sign; `walletSigned` fills the wallet's signature slot. */
  function signedSwap({ walletSigned = true, signer = WALLET } = {}) {
    const tx = new VersionedTransaction(new TransactionMessage({ payerKey: PAYMASTER.publicKey, recentBlockhash: bs58.encode(new Uint8Array(32).fill(7)), instructions: [
      new TransactionInstruction({ programId: new PublicKey(JUP), keys: [{ pubkey: new PublicKey(signer), isSigner: true, isWritable: false }], data: Buffer.from([1]) }),
    ] }).compileToV0Message());
    tx.sign([PAYMASTER]);
    if (walletSigned) tx.signatures[1] = new Uint8Array(64).fill(1);
    return { base64: Buffer.from(tx.serialize()).toString("base64"), signature: bs58.encode(tx.signatures[0]!) };
  }
  /** Mocks Helius RPC; Sender calls are recorded separately and answered by `sender`. */
  function helius(handler: (body: any) => Response, calls: any[] = [], senderCalls: any[] = [], sender: () => Response = () => Response.json({ jsonrpc: "2.0", id: 1, result: "ok" })) {
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = JSON.parse(String(init?.body));
      if (url.hostname === "sender.helius-rpc.com") { expect(url.searchParams.get("swqos_only")).toBe("true"); senderCalls.push(body); return sender(); }
      expect(url.hostname).toBe("mainnet.helius-rpc.com");
      calls.push(body); return handler(body);
    }) as unknown as typeof fetch;
    return calls;
  }

  it("relays only transactions the caller's wallet signed: preflighted Helius RPC, then Helius Sender", async () => {
    const { base64, signature } = signedSwap();
    expect((await post("/trade/submit", { transaction: base64 })).status).toBe(503); // no Helius key
    sponsored();
    const senderCalls: any[] = [];
    const calls = helius(() => Response.json({ jsonrpc: "2.0", id: 1, result: signature }), [], senderCalls);
    expect((await app.request("/trade/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transaction: base64 }) })).status).toBe(401);
    expect(await json(post("/trade/submit", { transaction: base64 }))).toEqual({ signature });
    expect(calls).toEqual([expect.objectContaining({ method: "sendTransaction", params: [base64, expect.objectContaining({ encoding: "base64", preflightCommitment: "confirmed" })] })]);
    expect(senderCalls).toEqual([expect.objectContaining({ method: "sendTransaction", params: [base64, { encoding: "base64", skipPreflight: true, maxRetries: 0 }] })]);

    calls.length = 0; senderCalls.length = 0;
    expect((await post("/trade/submit", { transaction: signedSwap({ walletSigned: false }).base64 })).status).toBe(400);
    expect((await post("/trade/submit", { transaction: signedSwap({ signer: OTHER_WALLET }).base64 })).status).toBe(400);
    expect((await post("/trade/submit", { transaction: base64 }, "no-wallet")).status).toBe(400);
    expect((await post("/trade/submit", { transaction: "bm90IGEgdHg=" })).status).toBe(400);
    expect(calls).toEqual([]);
    expect(senderCalls).toEqual([]);
  });

  it("surfaces preflight failures as 400 without using Sender, retries 429s, falls back to Sender, else 503", async () => {
    sponsored();
    const { base64, signature } = signedSwap();
    const senderCalls: any[] = [];
    helius(() => Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32002, message: "Transaction simulation failed: Error processing Instruction 1: custom program error: 0x1771", data: { logs: ["Program log: Error: SlippageToleranceExceeded"] } } }), [], senderCalls);
    const failed = await post("/trade/submit", { transaction: base64 });
    expect(failed.status).toBe(400);
    expect((await failed.json() as any).error).toContain("0x1771");
    expect(senderCalls).toEqual([]);

    let attempts = 0;
    helius(() => (++attempts < 3 ? new Response("rate limited", { status: 429 }) : Response.json({ jsonrpc: "2.0", id: 1, result: signature })));
    expect(await json(post("/trade/submit", { transaction: base64 }))).toEqual({ signature });
    expect(attempts).toBe(3);

    helius(() => new Response("rate limited", { status: 429 }), [], senderCalls);
    expect(await json(post("/trade/submit", { transaction: base64 }))).toEqual({ signature });
    expect(senderCalls).toHaveLength(1);

    helius(() => new Response("rate limited", { status: 429 }), [], [], () => new Response("down", { status: 503 }));
    expect((await post("/trade/submit", { transaction: base64 })).status).toBe(503);
  });

  it("batches signature statuses into one getSignatureStatuses call", async () => {
    const sigs = ["5".repeat(88), "6".repeat(88), "7".repeat(88)];
    expect((await post("/trade/status", { signatures: sigs })).status).toBe(503);
    process.env.HELIUS_API_KEY = "test";
    const calls = helius(() => Response.json({ jsonrpc: "2.0", id: 1, result: { value: [{ err: null, confirmationStatus: "confirmed" }, { err: { InstructionError: [1, { Custom: 6001 }] }, confirmationStatus: "confirmed" }, null] } }));
    expect(await json(post("/trade/status", { signatures: sigs }))).toEqual({ statuses: [
      { signature: sigs[0], status: "confirmed", error: null },
      { signature: sigs[1], status: "failed", error: JSON.stringify({ InstructionError: [1, { Custom: 6001 }] }) },
      { signature: sigs[2], status: "pending", error: null },
    ] });
    expect(calls).toEqual([expect.objectContaining({ method: "getSignatureStatuses", params: [sigs, { searchTransactionHistory: true }] })]);
    expect((await post("/trade/status", { signatures: [] })).status).toBe(400);
    expect((await post("/trade/status", { signatures: ["not-a-signature"] })).status).toBe(400);
  });
});
