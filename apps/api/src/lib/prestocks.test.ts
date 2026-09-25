import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { setSecrets, setFeatures, resetConfig } from "./config";
import { PRESTOCKS_DIRECTORY_URL, parsePreStock, preStock, preStocksDirectory, resetPreStocksCache, verifyPreStock } from "./prestocks";
import { bags, isTradable, resolveAsset } from "./bags";
import { resetMintRegistry, seedMints } from "./mint-registry";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT = "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF";
const MINT2 = "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw";
const row = (extra: Record<string, unknown> = {}) => ({ name: "OpenAI PreStocks", symbol: "OPENAI", description: "OpenAI <b>pioneers</b> models.\n\nOPENAI is a PreStocks issued token.", image: "https://www.prestocks.com/logos/openai.png", external_url: "https://www.prestocks.com/openai", contract_address: MINT, markPrice: 1023.7, markValuation: 1.2e12, tokenPrice: 1335.8, impliedValuation: 1.6e12, supply: 2826.3, ...extra });
const directoryResponse = (rows: unknown[]) => Response.json(rows);
const jupiterToken = (extra: Record<string, unknown> = {}) => ({ id: MINT, symbol: "OPENAI", name: "OpenAI PreStocks", decimals: 9, tags: ["prestocks", "token-2022", "verified", "stocks"], ...extra });
const originalFetch = globalThis.fetch;

/** Mocks directory + Jupiter search/quote/price with overridable pieces. */
function provider(options: { directory?: () => Response; token?: Record<string, unknown> | null; quote?: () => Response; price?: () => Response } = {}) {
  const calls = { directory: 0, search: 0, quote: 0, price: 0 };
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === PRESTOCKS_DIRECTORY_URL) { calls.directory++; expect(init?.redirect).toBe("error"); return options.directory ? options.directory() : directoryResponse([row()]); }
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test");
    if (url.includes("/tokens/v2/search")) { calls.search++; return Response.json(options.token === null ? [] : [{ id: MINT2, symbol: "ANTHROPIC" }, options.token ?? jupiterToken()]); }
    if (url.includes("/swap/v1/quote")) { calls.quote++; return options.quote ? options.quote() : Response.json({ inputMint: USDC, outputMint: new URL(url).searchParams.get("outputMint"), inAmount: "1000000", outAmount: "490615" }); }
    if (url.includes("/price/v3")) { calls.price++; return options.price ? options.price() : Response.json({ [MINT]: { usdPrice: 1376, scaledUiConfig: { multiplier: 1, newMultiplier: 1.4861347, newMultiplierEffectiveAt: "2026-07-17T16:30:00Z" } } }); }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return calls;
}

beforeEach(() => {
  setFeatures({ xstocks: false }); resetPreStocksCache(); setSecrets({ JupiterApiKey: "test" }); setFeatures({ prestocks: true }); seedMints(`OPENAI:${MINT}`); });
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConfig();
});

describe("PreStocks directory", () => {
  it("parses only well-formed issuer rows from the official hosts", () => {
    expect(parsePreStock(row())).toMatchObject({ symbol: "OPENAI", mint: MINT, imageUrl: "https://www.prestocks.com/logos/openai.png", productUrl: "https://www.prestocks.com/openai", markPrice: 1023.7, description: "OpenAI pioneers models. OPENAI is a PreStocks issued token." });
    expect(parsePreStock(row({ contract_address: "So11111111111111111111111111111111111111112" }))).toBeNull();
    expect(parsePreStock(row({ image: "https://evil.example/logos/openai.png" }))).toBeNull();
    expect(parsePreStock(row({ image: "http://www.prestocks.com/logos/openai.png" }))).toBeNull();
    expect(parsePreStock(row({ external_url: "https://www.prestocks.com/openai?ref=x" }))).toBeNull();
    expect(parsePreStock(row({ symbol: "openai" }))).toBeNull();
    expect(parsePreStock(row({ markPrice: "1023" }))).toBeNull();
    expect(parsePreStock(row({ tokenPrice: -1 }))).toBeNull();
    expect(parsePreStock(null)).toBeNull();
  });
  it("fetches once, caches, drops duplicates, and serves stale data when the issuer fails", async () => {
    const calls = provider({ directory: () => directoryResponse([row(), row({ symbol: "DUPE" }), row({ symbol: "ANTHROPIC", contract_address: MINT2 }), { junk: true }]) });
    const [first, second] = await Promise.all([preStocksDirectory(), preStocksDirectory()]);
    expect(first?.assets.map((asset) => asset.symbol)).toEqual(["OPENAI", "ANTHROPIC"]);
    expect(second).toBe(first!);
    expect(calls.directory).toBe(1);
    expect((await preStock("OPENAI"))?.mint).toBe(MINT);
    expect(await preStock("SPACEX")).toBeNull();
  });
  it("returns null (never throws) when the directory is unreachable, malformed, or disabled", async () => {
    for (const directory of [() => new Response("down", { status: 503 }), () => new Response("[]", { headers: { "content-type": "application/json" } }), () => new Response("<html>", { headers: { "content-type": "text/html" } }), () => Response.json([{ junk: true }])]) {
      resetPreStocksCache(); provider({ directory });
      expect(await preStocksDirectory()).toBeNull();
    }
    resetPreStocksCache();
    globalThis.fetch = mock(async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as unknown as typeof fetch;
    expect(await preStocksDirectory()).toBeNull();
    setFeatures({ prestocks: false });
    const calls = provider();
    expect(await preStocksDirectory()).toBeNull();
    expect(calls.directory).toBe(0);
  });
});

describe("PreStocks Jupiter verification and tradability gating", () => {
  const asset = parsePreStock(row())!;
  it("verifies exact mint, symbol, decimals, tags, live USDC route and reads the scaled UI multiplier", async () => {
    const calls = provider();
    const result = await verifyPreStock(asset);
    expect(result).toEqual({ verified: true, decimals: 9, uiAmountMultiplier: 1.4861347, reason: null });
    expect(await verifyPreStock(asset)).toEqual(result);
    expect(calls).toMatchObject({ search: 1, quote: 1, price: 1 });
  });
  it("uses the pre-change multiplier until the effective date and 1 without a scaled config", async () => {
    provider({ price: () => Response.json({ [MINT]: { scaledUiConfig: { multiplier: 1, newMultiplier: 5, newMultiplierEffectiveAt: "2999-01-01T00:00:00Z" } } }) });
    expect((await verifyPreStock(asset)).uiAmountMultiplier).toBe(1);
    resetPreStocksCache();
    provider({ price: () => Response.json({ [MINT]: {} }) });
    expect((await verifyPreStock(asset)).uiAmountMultiplier).toBe(1);
    resetPreStocksCache();
    provider({ price: () => new Response("down", { status: 503 }) });
    expect(await verifyPreStock(asset)).toMatchObject({ verified: true, uiAmountMultiplier: 1 });
  });
  it("fails closed for missing mint, symbol mismatch, missing tags, no route, or no Jupiter key", async () => {
    const cases: [Parameters<typeof provider>[0], RegExp][] = [
      [{ token: null }, /not found/],
      [{ token: jupiterToken({ symbol: "OPENAl" }) }, /symbol/],
      [{ token: jupiterToken({ tags: ["token-2022", "verified"] }) }, /tags/],
      [{ token: jupiterToken({ decimals: "9" }) }, /decimals/],
      [{ quote: () => Response.json({ error: "No routes found", errorCode: "NO_ROUTES_FOUND" }, { status: 400 }) }, /route/],
      [{ quote: () => Response.json({ inputMint: USDC, outputMint: MINT2, inAmount: "1000000", outAmount: "1" }) }, /did not return/],
    ];
    for (const [options, reason] of cases) {
      resetPreStocksCache(); provider(options);
      const result = await verifyPreStock(asset);
      expect(result.verified).toBe(false);
      expect(result.reason).toMatch(reason);
    }
    resetPreStocksCache(); setSecrets({ JupiterApiKey: undefined });
    expect(await verifyPreStock(asset)).toMatchObject({ verified: false, reason: "Jupiter is not configured" });
  });
  it("resolves a PreStocks asset only when allowlist, issuer directory and Jupiter agree", async () => {
    const bag = bags.find((item) => item.id === "frontier-ai-labs")!;
    const openai = bag.assets.find((item) => item.symbol === "OPENAI")!;
    provider();
    expect(await resolveAsset(bag, openai)).toMatchObject({ mint: MINT, decimals: 9, uiAmountMultiplier: 1.4861347, issuer: "prestocks", assetClass: "pre-ipo", issuerIconUrl: "https://www.prestocks.com/logos/openai.png", reference: { markPrice: 1023.7, tokenPrice: 1335.8, impliedValuation: 1.6e12 } });
    expect(typeof (await resolveAsset(bag, openai)).reference?.asOf).toBe("string");
    // Anthropic is in the bag but not in the mocked directory nor the allowlist.
    expect(await resolveAsset(bag, bag.assets.find((item) => item.symbol === "ANTHROPIC")!)).toMatchObject({ mint: null, reference: null, issuer: "prestocks" });
    expect(await isTradable(bag)).toBe(false);
    // Allowlisted mint that differs from the issuer's current contract address is refused.
    seedMints(`OPENAI:${MINT2}`);
    expect((await resolveAsset(bag, openai)).mint).toBeNull();
    // Issuer-listed and allowlisted but Jupiter verification fails.
    seedMints(`OPENAI:${MINT}`);
    resetPreStocksCache(); provider({ token: null });
    expect(await resolveAsset(bag, openai)).toMatchObject({ mint: null, reference: { tokenPrice: 1335.8 } });
    // Directory down and nothing cached: research-only, no reference, no throw.
    resetPreStocksCache(); provider({ directory: () => new Response("down", { status: 503 }) });
    expect(await resolveAsset(bag, openai)).toMatchObject({ mint: null, reference: null, issuerIconUrl: null });
  });
  it("keeps xStocks resolution independent of the PreStocks directory", async () => {
    globalThis.fetch = mock(async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
    seedMints("AAPLx:XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
    const bag = bags[0]!;
    expect(await resolveAsset(bag, bag.assets.find((asset) => asset.symbol === "AAPLx")!)).toMatchObject({ mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", decimals: 8, uiAmountMultiplier: 1, issuer: "xstocks", assetClass: "public-equity", reference: null });
  });
});
