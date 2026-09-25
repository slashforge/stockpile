import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { fakeTransaction } from "../lib/solana-tx.fixture";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WALLET = "11111111111111111111111111111111";
const OTHER_WALLET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const mints = { AAPLx: "22222222222222222222222222222222", MSFTx: "33333333333333333333333333333333", NVDAx: "44444444444444444444444444444444" };
const saved = new Map<string, Set<string>>();
let insertedUser: string | undefined;
let deleted = false;
const requestBody = { bagId: "megacap-builders", inputMint: USDC, amount: "1000000" };
const unsignedTx = fakeTransaction(WALLET, { version: 0 });

mock.module("../lib/identity", () => ({
  verifyIdentity: async (token: string) => token === "valid" || token === "no-wallet" || token === "other"
    ? { id: token === "other" ? "user-b" : "user-a", email: "verified@example.com", walletAddress: token === "no-wallet" ? null : WALLET }
    : null,
  syncUser: async (identity: { id: string; email: string; walletAddress: string | null }) => {
    insertedUser = identity.id;
    return { ...identity, createdAt: "2026-01-01T00:00:00.000Z" };
  },
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
const app = new Hono();
app.route("/", account);
const originalFetch = globalThis.fetch;
const original = Object.fromEntries(["PRIVY_APP_ID", "PRIVY_APP_SECRET", "JUPITER_API_KEY", "HELIUS_API_KEY", "STOCKPILE_ALLOWED_MINTS", "STOCKPILE_PRESTOCKS"].map((key) => [key, process.env[key]]));

function auth(token = "valid") { currentUser = token === "other" ? "user-b" : "user-a"; return { "privy-id-token": token }; }
function post(path: string, body: unknown, token = "valid") { return app.request(path, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function json(response: Response | Promise<Response>) { return (await response).json() as Promise<any>; }
function allMints() { process.env.STOCKPILE_ALLOWED_MINTS = Object.entries(mints).map(([symbol, mint]) => `${symbol}:${mint}`).join(","); }
const quoteFor = (url: URL, extra: Record<string, unknown> = {}) => Response.json({ inputMint: url.searchParams.get("inputMint"), outputMint: url.searchParams.get("outputMint"), inAmount: url.searchParams.get("amount"), outAmount: "42", otherAmountThreshold: "41", slippageBps: Number(url.searchParams.get("slippageBps")), priceImpactPct: "0.001", routePlan: [{}], ...extra });
/** Mocks Jupiter quote + swap. `swap` decides each swap response given its 1-based call number. */
function jupiter(swap: (call: number, body: any) => Response, swapRequests: any[] = []) {
  let quoteCalls = 0; let swapCalls = 0;
  globalThis.fetch = mock(async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    expect((options?.headers as Record<string, string>)["x-api-key"]).toBe("test");
    if (url.pathname.endsWith("/quote")) { quoteCalls++; return quoteFor(url); }
    const body = JSON.parse(String(options?.body)); swapRequests.push(body);
    return swap(++swapCalls, body);
  }) as unknown as typeof fetch;
  return { quoteCalls: () => quoteCalls, swapCalls: () => swapCalls };
}

beforeEach(() => {
  saved.clear(); insertedUser = undefined; deleted = false;
  process.env.PRIVY_APP_ID = "test-app"; process.env.PRIVY_APP_SECRET = "test-secret";
  delete process.env.JUPITER_API_KEY; delete process.env.HELIUS_API_KEY; delete process.env.STOCKPILE_ALLOWED_MINTS; process.env.STOCKPILE_PRESTOCKS = "0";
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
    process.env.STOCKPILE_ALLOWED_MINTS = `NVDAx:${mints.NVDAx}`;
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
    expect(await json(app.request("/portfolio", { headers: auth() }))).toMatchObject({ status: "live", sol: { amount: "0", decimals: 9 }, usdc: { amount: "0", decimals: 6 }, holdings: [] });
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
    process.env.STOCKPILE_ALLOWED_MINTS = `AAPLx:${mints.AAPLx},MSFTx:${mints.MSFTx}`;
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
    allMints(); process.env.JUPITER_API_KEY = "test";
    const { quoteCalls, swapCalls } = jupiter((call) => call === 2 ? new Response("fail", { status: 503 }) : Response.json({ swapTransaction: unsignedTx, lastValidBlockHeight: 100 }));
    expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", transactions: [], error: { code: "PROVIDER_ERROR", legIndex: 1, symbol: "MSFTx" } });
    expect(quoteCalls()).toBe(3);
    expect(swapCalls()).toBe(2);
  });
  it("prepares one labelled unsigned transaction per leg with the user's wallet as fee payer", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    const requests: { quoteResponse: { outputMint: string }; userPublicKey: string }[] = [];
    jupiter(() => Response.json({ swapTransaction: unsignedTx, lastValidBlockHeight: 123 }), requests);
    const result = await json(post("/trade/prepare", requestBody));
    expect(result).toMatchObject({ status: "ready", walletAddress: WALLET, bagId: "megacap-builders", error: null });
    expect(result.transactions.map((t: any) => [t.index, t.symbol, t.outputMint, t.inputAmount, t.transaction, t.lastValidBlockHeight])).toEqual([
      [0, "AAPLx", mints.AAPLx, "350000", unsignedTx, 123], [1, "MSFTx", mints.MSFTx, "350000", unsignedTx, 123], [2, "NVDAx", mints.NVDAx, "300000", unsignedTx, 123]]);
    expect(requests.map(({ quoteResponse }) => quoteResponse.outputMint)).toEqual(Object.values(mints));
    expect(requests.every(({ userPublicKey }) => userPublicKey === WALLET)).toBe(true);
  });
  it("refuses transactions that are malformed, pre-signed, or paid by another wallet", async () => {
    allMints(); process.env.JUPITER_API_KEY = "test";
    for (const swapTransaction of ["not base64!", "AQIDBA==", fakeTransaction(WALLET, { version: 0, signed: true }), fakeTransaction(OTHER_WALLET, { version: 0 })]) {
      jupiter(() => Response.json({ swapTransaction }));
      expect(await json(post("/trade/prepare", requestBody))).toMatchObject({ status: "unavailable", transactions: [], error: { code: "INVALID_TRANSACTION", legIndex: 0, symbol: "AAPLx" } });
    }
  });
});
